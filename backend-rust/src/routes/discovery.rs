use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    services::{geo_service, visibility_score},
    state::AppState,
};
use axum::{
    extract::{Extension, Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{doc, Document};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/discover", get(discover))
        .route("/discover/decide", post(decide))
        .route("/explore/lanes", get(explore_lanes))
}

#[derive(Deserialize)]
pub struct DiscoverParams {
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub radius_km: Option<f64>,
    pub category: Option<String>,
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub sort: Option<String>,
    pub verified_only: Option<bool>,
    pub open_now: Option<bool>,
}

async fn discover(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiscoverParams>,
) -> Result<impl IntoResponse> {
    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");

    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    let radius_km = params.radius_km.unwrap_or(5.0);

    let mut filter = doc! {};

    if let Some(cat) = &params.category {
        filter.insert("category", cat.as_str());
    }

    if let Some(q) = &params.q {
        if !q.is_empty() {
            filter.insert(
                "$or",
                vec![
                    doc! { "name": { "$regex": q, "$options": "i" } },
                    doc! { "description": { "$regex": q, "$options": "i" } },
                    doc! { "category": { "$regex": q, "$options": "i" } },
                ],
            );
        }
    }

    if params.verified_only.unwrap_or(false) {
        filter.insert("is_verified", true);
    }

    let mut cursor = businesses
        .find(filter)
        .skip(offset as u64)
        .limit(limit * 3) // over-fetch for geo filtering
        .await?;

    let mut results: Vec<Value> = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        let mut val = serde_json::to_value(&doc).unwrap_or(Value::Null);

        // Inject distance if coordinates provided
        if let (Some(user_lat), Some(user_lng)) = (params.lat, params.lng) {
            if let Some(loc) = doc.get_document("location").ok() {
                if let Ok(coords) = loc.get_array("coordinates") {
                    if coords.len() == 2 {
                        let biz_lng = coords[0].as_f64().unwrap_or(0.0);
                        let biz_lat = coords[1].as_f64().unwrap_or(0.0);
                        let dist = geo_service::haversine_km(user_lat, user_lng, biz_lat, biz_lng);

                        if dist > radius_km {
                            continue;
                        }

                        val["distance_km"] = json!(dist);
                    }
                }
            }
        }

        // Compute visibility score
        let vs = visibility_score::compute(&doc);
        val["visibility_score"] = json!(vs);

        results.push(val);
    }

    // Sort by sort param
    match params.sort.as_deref() {
        Some("distance") => {
            results.sort_by(|a, b| {
                let da = a["distance_km"].as_f64().unwrap_or(f64::MAX);
                let db = b["distance_km"].as_f64().unwrap_or(f64::MAX);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        Some("rating") => {
            results.sort_by(|a, b| {
                let ra = a["rating"].as_f64().unwrap_or(0.0);
                let rb = b["rating"].as_f64().unwrap_or(0.0);
                rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        _ => {
            // Default: sort by visibility score desc
            results.sort_by(|a, b| {
                let va = a["visibility_score"].as_f64().unwrap_or(0.0);
                let vb = b["visibility_score"].as_f64().unwrap_or(0.0);
                vb.partial_cmp(&va).unwrap_or(std::cmp::Ordering::Equal)
            });
        }
    }

    let total = results.len();
    let results: Vec<Value> = results.into_iter().take(limit as usize).collect();

    Ok(Json(json!({
        "businesses": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}

async fn decide(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let intent = payload["intent"].as_str().unwrap_or("explore");
    let lat = payload["lat"].as_f64();
    let lng = payload["lng"].as_f64();
    let constraints = payload["constraints"].as_array().cloned().unwrap_or_default();

    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let mut filter = doc! {};

    // Apply intent to category filter
    let category_hint = match intent {
        "eat" | "food" => Some("restaurant"),
        "coffee" => Some("cafe"),
        "drinks" => Some("bar"),
        "shop" => None,
        _ => None,
    };

    if let Some(cat) = category_hint {
        filter.insert("category", cat);
    }

    let mut cursor = businesses.find(filter).limit(50).await?;
    let mut candidates: Vec<(Value, f64)> = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        let mut val = serde_json::to_value(&doc).unwrap_or(Value::Null);
        let mut score = visibility_score::compute(&doc);

        if let (Some(u_lat), Some(u_lng)) = (lat, lng) {
            if let Some(loc) = doc.get_document("location").ok() {
                if let Ok(coords) = loc.get_array("coordinates") {
                    if coords.len() == 2 {
                        let biz_lng = coords[0].as_f64().unwrap_or(0.0);
                        let biz_lat = coords[1].as_f64().unwrap_or(0.0);
                        let dist = geo_service::haversine_km(u_lat, u_lng, biz_lat, biz_lng);
                        val["distance_km"] = json!(dist);
                        // Proximity boost: closer = higher score
                        score += (5.0 - dist.min(5.0)) * 2.0;
                    }
                }
            }
        }

        // Apply constraint filters
        let mut passes = true;
        for c in &constraints {
            if let Some(c_str) = c.as_str() {
                match c_str {
                    "verified" => {
                        if !val["is_verified"].as_bool().unwrap_or(false) {
                            passes = false;
                        }
                    }
                    "high_rated" => {
                        if val["rating"].as_f64().unwrap_or(0.0) < 4.0 {
                            passes = false;
                        }
                    }
                    _ => {}
                }
            }
        }

        if passes {
            val["visibility_score"] = json!(score);
            candidates.push((val, score));
        }
    }

    candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let recommendations: Vec<Value> = candidates.into_iter().take(3).map(|(v, _)| v).collect();

    Ok(Json(json!({
        "intent": intent,
        "recommendations": recommendations,
    })))
}

async fn explore_lanes(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiscoverParams>,
) -> Result<impl IntoResponse> {
    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let lat = params.lat.unwrap_or(state.config.demo_lat);
    let lng = params.lng.unwrap_or(state.config.demo_lng);

    let categories = ["restaurant", "cafe", "bar", "gym", "salon"];
    let mut lanes: Vec<Value> = Vec::new();

    for cat in &categories {
        let mut cursor = businesses
            .find(doc! { "category": *cat })
            .limit(10)
            .await?;

        let mut items: Vec<(Value, f64)> = Vec::new();
        while cursor.advance().await? {
            let doc = cursor.deserialize_current()?;
            let mut val = serde_json::to_value(&doc).unwrap_or(Value::Null);
            let mut score = visibility_score::compute(&doc);

            if let Some(loc) = doc.get_document("location").ok() {
                if let Ok(coords) = loc.get_array("coordinates") {
                    if coords.len() == 2 {
                        let biz_lng = coords[0].as_f64().unwrap_or(0.0);
                        let biz_lat = coords[1].as_f64().unwrap_or(0.0);
                        let dist = geo_service::haversine_km(lat, lng, biz_lat, biz_lng);
                        val["distance_km"] = json!(dist);
                        score += (5.0 - dist.min(5.0)) * 1.5;
                    }
                }
            }

            val["visibility_score"] = json!(score);
            items.push((val, score));
        }

        items.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        if !items.is_empty() {
            lanes.push(json!({
                "id": cat,
                "title": format!("Top {}", capitalize(cat)),
                "businesses": items.into_iter().take(5).map(|(v, _)| v).collect::<Vec<_>>(),
            }));
        }
    }

    Ok(Json(json!({ "lanes": lanes })))
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

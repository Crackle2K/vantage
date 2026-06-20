use crate::{
    errors::Result,
    routes::support::{
        business_lat_lng, eq, geo_rpc_unavailable, ilike_or_filter, is_true, limit,
        normalize_business, offset, order, select_all, unwrap_rpc_items, QueryParams,
    },
    security,
    services::{geo_service, visibility_score},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/discover", get(discover))
        .route("/decide", get(decide_get).post(decide_post))
        .route("/explore/lanes", get(explore_lanes))
}

#[derive(Clone, Deserialize)]
pub struct DiscoverParams {
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub radius: Option<f64>,
    pub radius_km: Option<f64>,
    pub category: Option<String>,
    pub q: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub sort: Option<String>,
    pub sort_mode: Option<String>,
    pub verified_only: Option<bool>,
    pub open_now: Option<bool>,
    pub refresh: Option<bool>,
    pub intent: Option<String>,
    pub constraints: Option<String>,
}

async fn discover(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiscoverParams>,
) -> Result<impl IntoResponse> {
    let businesses = discover_rows(&state, &params).await?;
    Ok(Json(businesses))
}

async fn decide_get(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiscoverParams>,
) -> Result<impl IntoResponse> {
    let response = decide_from_params(&state, params).await?;
    Ok(Json(response))
}

async fn decide_post(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    let constraints = payload["constraints"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(",")
        })
        .or_else(|| payload["constraints"].as_str().map(str::to_string));

    let params = DiscoverParams {
        lat: payload["lat"].as_f64(),
        lng: payload["lng"].as_f64(),
        radius: payload["radius"].as_f64(),
        radius_km: payload["radius_km"].as_f64(),
        category: payload["category"].as_str().map(str::to_string),
        q: None,
        search: None,
        limit: payload["limit"].as_i64(),
        offset: None,
        sort: None,
        sort_mode: None,
        verified_only: None,
        open_now: None,
        refresh: None,
        intent: payload["intent"].as_str().map(str::to_string),
        constraints,
    };

    Ok(Json(decide_from_params(&state, params).await?))
}

async fn explore_lanes(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiscoverParams>,
) -> Result<impl IntoResponse> {
    let (lat, lng) = security::validate_optional_lat_lng(params.lat, params.lng)?
        .unwrap_or((state.config.demo_lat, state.config.demo_lng));

    let lane_specs = [
        ("for_you", "For You", None),
        ("active", "Active Nearby", None),
        ("restaurants", "Restaurants", Some("restaurant")),
        ("coffee", "Coffee", Some("cafe")),
        ("trusted", "Most Trusted", None),
    ];
    let mut lanes = Vec::new();

    for (id, title, category) in lane_specs {
        let mut lane_params = params.clone();
        lane_params.lat = Some(lat);
        lane_params.lng = Some(lng);
        lane_params.limit = Some(10);
        lane_params.category = category.map(str::to_string);
        lane_params.sort = Some(if id == "trusted" {
            "rating".into()
        } else {
            "canonical".into()
        });

        let items = discover_rows(&state, &lane_params).await?;
        if !items.is_empty() {
            lanes.push(json!({
                "id": id,
                "title": title,
                "subtitle": lane_subtitle(id),
                "items": items.into_iter().take(5).collect::<Vec<_>>(),
            }));
        }
    }

    Ok(Json(json!({ "lanes": lanes })))
}

async fn decide_from_params(state: &AppState, mut params: DiscoverParams) -> Result<Value> {
    let (response_limit, candidate_limit) = decide_limits(params.limit);
    let intent = params.intent.clone().unwrap_or_else(|| "EXPLORE".into());
    if params.category.is_none() {
        params.category = category_for_intent(&intent).map(str::to_string);
    }
    params.sort = Some("canonical".into());
    params.limit = Some(candidate_limit);

    let constraints = params
        .constraints
        .clone()
        .unwrap_or_default()
        .split(',')
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    let mut rows = discover_rows(state, &params).await?;
    rows.retain(|row| passes_decide_constraints(row, &constraints));
    rows.truncate(response_limit as usize);

    Ok(json!({
        "items": rows,
        "intent_explanation": intent_explanation(&intent, &constraints),
    }))
}

fn decide_limits(requested: Option<i64>) -> (i64, i64) {
    let response_limit = requested.unwrap_or(3).clamp(1, 3);
    (response_limit, response_limit * 5)
}

async fn discover_rows(state: &AppState, params: &DiscoverParams) -> Result<Vec<Value>> {
    let has_coordinates = security::validate_optional_lat_lng(params.lat, params.lng)?.is_some();

    let limit_value = params.limit.unwrap_or(50).clamp(1, 200);
    let radius_km = params
        .radius_km
        .or(params.radius)
        .unwrap_or(25.0)
        .clamp(0.1, 150.0);

    if has_coordinates {
        match discover_rows_geo(state, params, limit_value, radius_km).await {
            Ok(rows) => return Ok(rows),
            Err(err) if geo_rpc_unavailable(&err.to_string()) => {
                tracing::warn!(
                    error = %err,
                    "PostGIS discovery RPC unavailable; falling back to Rust distance filtering"
                );
            }
            Err(err) => return Err(err.into()),
        }
    }

    let mut query: QueryParams = vec![
        select_all(),
        limit(if has_coordinates {
            limit_value * 3
        } else {
            limit_value
        }),
        offset(params.offset.unwrap_or(0).max(0)),
        order("created_at.desc"),
    ];

    if let Some(category) = params.category.as_ref().filter(|value| !value.is_empty()) {
        query.push(eq("category", security::sanitize_text(category, 80)));
    }
    if let Some(search) = params
        .q
        .as_deref()
        .or(params.search.as_deref())
        .filter(|value| !value.trim().is_empty())
    {
        if let Some(filter) = ilike_or_filter(&["name", "description", "category"], search) {
            query.push(filter);
        }
    }
    if params.verified_only.unwrap_or(false) {
        query.push(is_true("is_verified"));
    }

    let rows = state.db.supabase.select_json("businesses", &query).await?;
    let mut results = rows
        .into_iter()
        .map(normalize_business)
        .filter_map(|mut row| {
            if let (Some(user_lat), Some(user_lng)) = (params.lat, params.lng) {
                let (biz_lat, biz_lng) = business_lat_lng(&row)?;
                let dist = geo_service::haversine_km(user_lat, user_lng, biz_lat, biz_lng);
                if dist > radius_km {
                    return None;
                }
                row["distance"] = json!(dist);
                row["distance_km"] = json!(dist);
            }

            let score = visibility_score::compute(&row);
            row["visibility_score"] = json!(score);
            row["live_visibility_score"] = json!(score);
            Some(row)
        })
        .collect::<Vec<_>>();

    match params.sort.as_deref().or(params.sort_mode.as_deref()) {
        Some("distance") => results.sort_by(|a, b| {
            a["distance_km"]
                .as_f64()
                .unwrap_or(f64::MAX)
                .partial_cmp(&b["distance_km"].as_f64().unwrap_or(f64::MAX))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        Some("rating") | Some("most_reviewed") => results.sort_by(|a, b| {
            let left = (
                b["rating"].as_f64().unwrap_or(0.0),
                b["review_count"].as_i64().unwrap_or(0),
            );
            let right = (
                a["rating"].as_f64().unwrap_or(0.0),
                a["review_count"].as_i64().unwrap_or(0),
            );
            left.partial_cmp(&right)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        Some("newest") => results.sort_by(|a, b| {
            b["created_at"]
                .as_str()
                .unwrap_or("")
                .cmp(a["created_at"].as_str().unwrap_or(""))
        }),
        _ => results.sort_by(|a, b| {
            b["visibility_score"]
                .as_f64()
                .unwrap_or(0.0)
                .partial_cmp(&a["visibility_score"].as_f64().unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
    }

    results.truncate(limit_value as usize);
    Ok(results)
}

async fn discover_rows_geo(
    state: &AppState,
    params: &DiscoverParams,
    limit_value: i64,
    radius_km: f64,
) -> anyhow::Result<Vec<Value>> {
    let lat = params.lat.expect("validated before geospatial query");
    let lng = params.lng.expect("validated before geospatial query");
    let sort = params
        .sort
        .as_deref()
        .or(params.sort_mode.as_deref())
        .unwrap_or("canonical");
    let category = params
        .category
        .as_ref()
        .filter(|value| !value.is_empty())
        .map(|value| security::sanitize_text(value, 80));
    let search = params
        .q
        .as_deref()
        .or(params.search.as_deref())
        .filter(|value| !value.trim().is_empty())
        .map(|value| security::sanitize_text(value, 120));

    let rows = state
        .db
        .supabase
        .rpc_json(
            "search_businesses_geo",
            json!({
                "p_lat": lat,
                "p_lng": lng,
                "p_radius_km": radius_km,
                "p_limit": (limit_value * 3).clamp(1, 600),
                "p_offset": params.offset.unwrap_or(0).max(0),
                "p_category": category,
                "p_search": search,
                "p_verified_only": params.verified_only.unwrap_or(false),
                "p_sort": sort,
            }),
        )
        .await?;

    let mut results = unwrap_rpc_items(rows)
        .into_iter()
        .map(normalize_business)
        .map(|mut row| {
            let score = visibility_score::compute(&row);
            row["visibility_score"] = json!(score);
            row["live_visibility_score"] = json!(score);
            row
        })
        .collect::<Vec<_>>();

    match Some(sort) {
        Some("distance") => results.sort_by(|a, b| {
            a["distance_km"]
                .as_f64()
                .unwrap_or(f64::MAX)
                .partial_cmp(&b["distance_km"].as_f64().unwrap_or(f64::MAX))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        Some("rating") | Some("most_reviewed") => results.sort_by(|a, b| {
            let left = (
                b["rating"].as_f64().unwrap_or(0.0),
                b["review_count"].as_i64().unwrap_or(0),
            );
            let right = (
                a["rating"].as_f64().unwrap_or(0.0),
                a["review_count"].as_i64().unwrap_or(0),
            );
            left.partial_cmp(&right)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        Some("newest") => results.sort_by(|a, b| {
            b["created_at"]
                .as_str()
                .unwrap_or("")
                .cmp(a["created_at"].as_str().unwrap_or(""))
        }),
        _ => results.sort_by(|a, b| {
            b["visibility_score"]
                .as_f64()
                .unwrap_or(0.0)
                .partial_cmp(&a["visibility_score"].as_f64().unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
    }

    results.truncate(limit_value as usize);
    Ok(results)
}

fn category_for_intent(intent: &str) -> Option<&'static str> {
    match intent.to_ascii_uppercase().as_str() {
        "DINNER" | "QUICK_BITE" | "DESSERT" => Some("Restaurants"),
        "COFFEE" | "STUDY" => Some("Cafes & Coffee"),
        "DATE_NIGHT" => Some("Bars & Nightlife"),
        _ => None,
    }
}

fn passes_decide_constraints(row: &Value, constraints: &[String]) -> bool {
    constraints
        .iter()
        .all(|constraint| match constraint.as_str() {
            "OPEN_NOW" => row["open_now"].as_bool().unwrap_or(true),
            "CHEAP" => row["price_level"].as_i64().unwrap_or(2) <= 1,
            "MOST_TRUSTED" => row["rating"].as_f64().unwrap_or(0.0) >= 4.0,
            "HIDDEN_GEM" => row["review_count"].as_i64().unwrap_or(0) < 50,
            "TRENDING" => row["trending_score"].as_f64().unwrap_or(0.0) > 0.0,
            _ => true,
        })
}

fn intent_explanation(intent: &str, constraints: &[String]) -> Vec<String> {
    let mut reasons = vec![format!(
        "Ranked for {}",
        intent.replace('_', " ").to_lowercase()
    )];
    if !constraints.is_empty() {
        reasons.push(format!("Applied {} preference filters", constraints.len()));
    }
    reasons.push("Sorted by Live Visibility Score, rating confidence, and proximity".into());
    reasons
}

fn lane_subtitle(id: &str) -> &'static str {
    match id {
        "for_you" => "Ranked by verified activity and local trust",
        "active" => "Nearby places with recent community signals",
        "restaurants" => "Food spots earning attention",
        "coffee" => "Cafe picks around you",
        "trusted" => "High-rating places with review confidence",
        _ => "Recommended local businesses",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decide_limits_default_to_three_and_never_exceed_requested_cap() {
        assert_eq!(decide_limits(None), (3, 15));
        assert_eq!(decide_limits(Some(2)), (2, 10));
        assert_eq!(decide_limits(Some(20)), (3, 15));
        assert_eq!(decide_limits(Some(0)), (1, 5));
    }

    #[test]
    fn intent_category_defaults_match_frontend_launch_categories() {
        assert_eq!(category_for_intent("DINNER"), Some("Restaurants"));
        assert_eq!(category_for_intent("COFFEE"), Some("Cafes & Coffee"));
        assert_eq!(category_for_intent("DATE_NIGHT"), Some("Bars & Nightlife"));
    }
}

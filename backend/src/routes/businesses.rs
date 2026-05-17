use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    models::business::{BusinessCreate, BusinessSearchQuery, BusinessUpdate},
    security,
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde_json::{json, Value};
use std::sync::Arc;
use validator::Validate;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/businesses", get(list_businesses).post(create_business))
        .route(
            "/businesses/:id",
            get(get_business)
                .put(update_business)
                .delete(delete_business),
        )
        .route("/businesses/:id/photo", get(get_business_photo))
}

async fn list_businesses(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BusinessSearchQuery>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let mut filter = doc! {};

    if let Some(q) = &params.q {
        if !q.is_empty() {
            let q = security::safe_regex_literal(q, 120);
            filter.insert(
                "$or",
                vec![
                    doc! { "name": { "$regex": q.as_str(), "$options": "i" } },
                    doc! { "description": { "$regex": q.as_str(), "$options": "i" } },
                ],
            );
        }
    }

    if let Some(cat) = &params.category {
        filter.insert("category", cat.as_str());
    }

    if params.verified_only.unwrap_or(false) {
        filter.insert("is_verified", true);
    }

    let mut cursor = collection
        .find(filter)
        .skip(offset as u64)
        .limit(limit)
        .await?;

    let mut businesses: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        businesses.push(doc_to_value(doc));
    }

    Ok(Json(
        json!({ "businesses": businesses, "total": businesses.len() }),
    ))
}

async fn get_business(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid business ID".into()))?;

    let doc = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;

    Ok(Json(doc_to_value(doc)))
}

async fn create_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<BusinessCreate>,
) -> Result<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let now = Utc::now();
    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        security::validate_lat_lng(lat, lng)?;
    }
    let website = security::normalize_url(payload.website.as_deref(), 500, false)?;

    let mut business_doc = doc! {
        "name": security::sanitize_text(&payload.name, 200),
        "address": security::sanitize_text(&payload.address, 300),
        "is_verified": false,
        "is_claimed": false,
        "owner_id": &auth_user.id,
        "review_count": 0,
        "photos": [],
        "known_for": [],
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
    };

    if let Some(cat) = &payload.category {
        business_doc.insert("category", security::sanitize_text(cat, 80));
    }
    if let Some(city) = &payload.city {
        business_doc.insert("city", security::sanitize_text(city, 120));
    }
    if let Some(state_val) = &payload.state {
        business_doc.insert("state", security::sanitize_text(state_val, 80));
    }
    if let Some(zip) = &payload.zip_code {
        business_doc.insert("zip_code", security::sanitize_text(zip, 20));
    }
    if let Some(phone) = &payload.phone {
        business_doc.insert("phone", security::sanitize_text(phone, 40));
    }
    if let Some(website) = website {
        business_doc.insert("website", website);
    }
    if let Some(desc) = &payload.description {
        business_doc.insert("description", security::sanitize_text(desc, 1000));
    }
    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        business_doc.insert(
            "location",
            doc! {
                "type": "Point",
                "coordinates": [lng, lat]
            },
        );
    }

    let result = collection.insert_one(business_doc).await?;
    let id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "message": "Business created" })),
    ))
}

async fn update_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<BusinessUpdate>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid business ID".into()))?;

    let existing = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;

    let owner_id = existing.get_str("owner_id").unwrap_or("");
    if owner_id != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    let now = Utc::now();
    let mut update_doc = doc! { "updated_at": now.to_rfc3339() };
    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        security::validate_lat_lng(lat, lng)?;
    }
    let website = security::normalize_url(payload.website.as_deref(), 500, false)?;

    if let Some(name) = &payload.name {
        update_doc.insert("name", security::sanitize_text(name, 200));
    }
    if let Some(cat) = &payload.category {
        update_doc.insert("category", security::sanitize_text(cat, 80));
    }
    if let Some(addr) = &payload.address {
        update_doc.insert("address", security::sanitize_text(addr, 300));
    }
    if let Some(phone) = &payload.phone {
        update_doc.insert("phone", security::sanitize_text(phone, 40));
    }
    if let Some(website) = website {
        update_doc.insert("website", website);
    }
    if let Some(desc) = &payload.description {
        update_doc.insert("description", security::sanitize_text(desc, 1000));
    }
    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        update_doc.insert(
            "location",
            doc! { "type": "Point", "coordinates": [lng, lat] },
        );
    }

    collection
        .update_one(doc! { "_id": oid }, doc! { "$set": update_doc })
        .await?;

    Ok(Json(json!({ "message": "Business updated" })))
}

async fn delete_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid business ID".into()))?;

    let existing = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;

    let owner_id = existing.get_str("owner_id").unwrap_or("");
    if owner_id != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    collection.delete_one(doc! { "_id": oid }).await?;

    Ok(Json(json!({ "message": "Business deleted" })))
}

async fn get_business_photo(
    State(state): State<Arc<AppState>>,
    Path(_id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Response> {
    let photo_ref = params
        .get("ref")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("Missing photo ref".into()))?;
    let photo_ref = security::validate_photo_reference(&photo_ref)?;

    if state.config.google_api_key.is_empty() {
        return Err(AppError::BadRequest("Google API not configured".into()));
    }

    let max_width = params
        .get("maxwidth")
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(800)
        .clamp(64, 1200);

    let url = format!(
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth={}&photo_reference={}&key={}",
        max_width, photo_ref, state.config.google_api_key
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if !response.status().is_success() {
        return Err(AppError::BadRequest("Photo is unavailable".into()));
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("image/jpeg"));
    let body: Bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=86400"),
            ),
        ],
        body,
    )
        .into_response())
}

fn doc_to_value(doc: Document) -> Value {
    serde_json::to_value(&doc).unwrap_or(Value::Null)
}

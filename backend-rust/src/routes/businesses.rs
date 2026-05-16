use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    models::business::{Business, BusinessCreate, BusinessSearchQuery, BusinessUpdate},
    state::AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
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
            get(get_business).put(update_business).delete(delete_business),
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
            filter.insert(
                "$or",
                vec![
                    doc! { "name": { "$regex": q, "$options": "i" } },
                    doc! { "description": { "$regex": q, "$options": "i" } },
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

    Ok(Json(json!({ "businesses": businesses, "total": businesses.len() })))
}

async fn get_business(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid business ID".into()))?;

    let doc = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;

    Ok(Json(doc_to_value(doc)))
}

async fn create_business(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<BusinessCreate>,
) -> Result<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let now = Utc::now();

    let mut business_doc = doc! {
        "name": &payload.name,
        "address": &payload.address,
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
        business_doc.insert("category", cat.as_str());
    }
    if let Some(city) = &payload.city {
        business_doc.insert("city", city.as_str());
    }
    if let Some(state_val) = &payload.state {
        business_doc.insert("state", state_val.as_str());
    }
    if let Some(zip) = &payload.zip_code {
        business_doc.insert("zip_code", zip.as_str());
    }
    if let Some(phone) = &payload.phone {
        business_doc.insert("phone", phone.as_str());
    }
    if let Some(website) = &payload.website {
        business_doc.insert("website", website.as_str());
    }
    if let Some(desc) = &payload.description {
        business_doc.insert("description", desc.as_str());
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

    Ok((StatusCode::CREATED, Json(json!({ "id": id, "message": "Business created" }))))
}

async fn update_business(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(payload): Json<BusinessUpdate>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid business ID".into()))?;

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

    if let Some(name) = &payload.name {
        update_doc.insert("name", name.as_str());
    }
    if let Some(cat) = &payload.category {
        update_doc.insert("category", cat.as_str());
    }
    if let Some(addr) = &payload.address {
        update_doc.insert("address", addr.as_str());
    }
    if let Some(phone) = &payload.phone {
        update_doc.insert("phone", phone.as_str());
    }
    if let Some(website) = &payload.website {
        update_doc.insert("website", website.as_str());
    }
    if let Some(desc) = &payload.description {
        update_doc.insert("description", desc.as_str());
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
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid business ID".into()))?;

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
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse> {
    let photo_ref = params
        .get("ref")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("Missing photo ref".into()))?;

    if state.config.google_api_key.is_empty() {
        return Err(AppError::BadRequest("Google API not configured".into()));
    }

    let url = format!(
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={}&key={}",
        photo_ref, state.config.google_api_key
    );

    Ok(Json(json!({ "url": url })))
}

fn doc_to_value(doc: Document) -> Value {
    serde_json::to_value(&doc).unwrap_or(Value::Null)
}

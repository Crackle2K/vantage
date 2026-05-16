use crate::{errors::{AppError, Result}, middleware::auth::AuthUser, state::AppState};
use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/deals", post(create_deal))
        .route("/deals/:id", get(get_deal).put(update_deal).delete(delete_deal))
        .route("/businesses/:id/deals", get(list_business_deals))
}

#[derive(Deserialize)]
struct PaginationParams {
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_business_deals(
    State(state): State<Arc<AppState>>,
    Path(business_id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("deals");
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let mut cursor = col
        .find(doc! { "business_id": &business_id, "is_active": true })
        .skip(offset as u64)
        .limit(limit)
        .sort(doc! { "created_at": -1 })
        .await?;

    let mut deals: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        deals.push(serde_json::to_value(&cursor.deserialize_current()?).unwrap_or(Value::Null));
    }

    Ok(Json(json!({ "deals": deals })))
}

async fn get_deal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("deals");
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid ID".into()))?;
    let doc = col
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Deal not found".into()))?;
    Ok(Json(serde_json::to_value(&doc).unwrap_or(Value::Null)))
}

#[derive(Deserialize)]
struct DealCreate {
    business_id: String,
    title: String,
    description: Option<String>,
    discount_percent: Option<f64>,
    original_price: Option<f64>,
    deal_price: Option<f64>,
}

async fn create_deal(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<DealCreate>,
) -> Result<impl IntoResponse> {
    // Verify user owns the business
    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let biz = businesses
        .find_one(doc! { "_id": &payload.business_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    if biz.get_str("owner_id").unwrap_or("") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    let col: mongodb::Collection<Document> = state.db.mongo.collection("deals");
    let now = Utc::now();
    let mut deal_doc = doc! {
        "business_id": &payload.business_id,
        "title": &payload.title,
        "is_active": true,
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
    };
    if let Some(desc) = &payload.description { deal_doc.insert("description", desc.as_str()); }
    if let Some(pct) = payload.discount_percent { deal_doc.insert("discount_percent", pct); }
    if let Some(op) = payload.original_price { deal_doc.insert("original_price", op); }
    if let Some(dp) = payload.deal_price { deal_doc.insert("deal_price", dp); }

    let result = col.insert_one(deal_doc).await?;
    let id = result.inserted_id.as_object_id().map(|o| o.to_hex()).unwrap_or_default();
    Ok((StatusCode::CREATED, Json(json!({ "id": id }))))
}

#[derive(Deserialize)]
struct DealUpdate {
    title: Option<String>,
    description: Option<String>,
    discount_percent: Option<f64>,
    is_active: Option<bool>,
}

async fn update_deal(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(payload): Json<DealUpdate>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("deals");
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid ID".into()))?;
    let existing = col.find_one(doc! { "_id": oid }).await?.ok_or_else(|| AppError::NotFound("Deal not found".into()))?;

    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let biz = businesses.find_one(doc! { "_id": existing.get_str("business_id").unwrap_or("") }).await?.unwrap_or_default();
    if biz.get_str("owner_id").unwrap_or("") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    let now = Utc::now();
    let mut update = doc! { "updated_at": now.to_rfc3339() };
    if let Some(t) = &payload.title { update.insert("title", t.as_str()); }
    if let Some(d) = &payload.description { update.insert("description", d.as_str()); }
    if let Some(p) = payload.discount_percent { update.insert("discount_percent", p); }
    if let Some(a) = payload.is_active { update.insert("is_active", a); }

    col.update_one(doc! { "_id": oid }, doc! { "$set": update }).await?;
    Ok(Json(json!({ "message": "Deal updated" })))
}

async fn delete_deal(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("deals");
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid ID".into()))?;
    col.find_one(doc! { "_id": oid }).await?.ok_or_else(|| AppError::NotFound("Deal not found".into()))?;
    col.delete_one(doc! { "_id": oid }).await?;
    Ok(Json(json!({ "message": "Deal deleted" })))
}

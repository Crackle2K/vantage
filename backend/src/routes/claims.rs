use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    security,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/claims", post(submit_claim))
        .route("/claims/my", get(my_claims))
        .route("/claims/mine", get(my_claims))
        .route("/claims/:id", get(get_claim).put(review_claim))
}

async fn submit_claim(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;
    let method = payload["verification_method"]
        .as_str()
        .unwrap_or("community");

    let col: mongodb::Collection<Document> = state.db.mongo.collection("claims");
    // One pending claim per user per business
    if col
        .find_one(doc! {
            "business_id": business_id,
            "user_id": &auth_user.id,
            "status": "pending",
        })
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("Claim already pending".into()));
    }

    let now = Utc::now();
    let claim_doc = doc! {
        "business_id": business_id,
        "user_id": &auth_user.id,
        "verification_method": method,
        "status": "pending",
        "notes": security::sanitize_optional_text(payload["notes"].as_str(), 1000).unwrap_or_default(),
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
    };

    let result = col.insert_one(claim_doc).await?;
    let id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "status": "pending" })),
    ))
}

async fn get_claim(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("claims");
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid ID".into()))?;
    let doc = col
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Claim not found".into()))?;
    Ok(Json(serde_json::to_value(&doc).unwrap_or(Value::Null)))
}

async fn my_claims(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("claims");
    let mut cursor = col
        .find(doc! { "user_id": &auth_user.id })
        .sort(doc! { "created_at": -1 })
        .await?;
    let mut claims: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        claims.push(serde_json::to_value(&cursor.deserialize_current()?).unwrap_or(Value::Null));
    }
    Ok(Json(json!({ "claims": claims })))
}

async fn review_claim(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    if auth_user.role != "admin" {
        return Err(AppError::Forbidden("Admin only".into()));
    }

    let status = payload["status"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("status required".into()))?;
    if !matches!(status, "approved" | "rejected") {
        return Err(AppError::BadRequest(
            "status must be approved or rejected".into(),
        ));
    }

    let col: mongodb::Collection<Document> = state.db.mongo.collection("claims");
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Invalid ID".into()))?;
    let existing = col
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Claim not found".into()))?;

    let now = Utc::now();
    col.update_one(
        doc! { "_id": oid },
        doc! { "$set": {
            "status": status,
            "reviewed_by": &auth_user.id,
            "reviewed_at": now.to_rfc3339(),
            "updated_at": now.to_rfc3339(),
            "notes": security::sanitize_optional_text(payload["notes"].as_str(), 1000).unwrap_or_default(),
        }},
    )
    .await?;

    if status == "approved" {
        let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
        let business_id = existing.get_str("business_id").unwrap_or("");
        let user_id = existing.get_str("user_id").unwrap_or("");
        businesses
            .update_one(
                doc! { "_id": business_id },
                doc! { "$set": { "is_claimed": true, "owner_id": user_id } },
            )
            .await
            .ok();
    }

    Ok(Json(
        json!({ "message": "Claim reviewed", "status": status }),
    ))
}

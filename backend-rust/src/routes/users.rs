use crate::{errors::{AppError, Result}, middleware::auth::AuthUser, state::AppState};
use axum::{
    extract::{Extension, Path, State},
    response::IntoResponse,
    routing::{get, put},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/me", get(get_me).put(update_me))
        .route("/me/preferences", put(update_preferences))
        .route("/me/password", put(change_password))
        .route("/:id", get(get_user_profile))
}

async fn get_me(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;
    let user = users
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    Ok(Json(sanitize_user(user)))
}

async fn update_me(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;

    let now = Utc::now();
    let mut update = doc! { "updated_at": now.to_rfc3339() };

    if let Some(name) = payload["full_name"].as_str() {
        update.insert("full_name", name);
    }

    users.update_one(doc! { "_id": oid }, doc! { "$set": update }).await?;
    Ok(Json(json!({ "message": "Profile updated" })))
}

async fn update_preferences(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;

    let now = Utc::now();
    // Store preferences as a JSON string field to avoid bson serialization complexity
    let pref_str = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into());
    users.update_one(
        doc! { "_id": oid },
        doc! { "$set": { "preferences_json": &pref_str, "updated_at": now.to_rfc3339() } },
    ).await?;

    Ok(Json(json!({ "message": "Preferences updated" })))
}

async fn change_password(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let current = payload["current_password"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("current_password required".into()))?;
    let new_pw = payload["new_password"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("new_password required".into()))?;

    if new_pw.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;
    let user = users.find_one(doc! { "_id": oid }).await?.ok_or_else(|| AppError::NotFound("User not found".into()))?;

    let hash_stored = user.get_str("password_hash").unwrap_or("");
    if hash_stored.is_empty() {
        return Err(AppError::BadRequest("Cannot change password for OAuth accounts".into()));
    }

    let valid = verify(current, hash_stored).map_err(|_| AppError::Unauthorized("Invalid current password".into()))?;
    if !valid {
        return Err(AppError::Unauthorized("Invalid current password".into()));
    }

    let new_hash = hash(new_pw, DEFAULT_COST).map_err(|e| AppError::Internal(e.to_string()))?;
    let now = Utc::now();
    users.update_one(doc! { "_id": oid }, doc! { "$set": { "password_hash": new_hash, "updated_at": now.to_rfc3339() } }).await?;

    Ok(Json(json!({ "message": "Password changed successfully" })))
}

async fn get_user_profile(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&user_id).map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;
    let user = users.find_one(doc! { "_id": oid }).await?.ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(Json(sanitize_user(user)))
}

fn sanitize_user(mut doc: Document) -> Value {
    doc.remove("password_hash");
    serde_json::to_value(&doc).unwrap_or(Value::Null)
}

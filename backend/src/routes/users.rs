use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    security,
    state::AppState,
};
use axum::{
    extract::{Path, State},
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
    auth_user: AuthUser,
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
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;

    let now = Utc::now();
    let mut update = doc! { "updated_at": now.to_rfc3339() };

    if let Some(name) = payload["name"]
        .as_str()
        .or_else(|| payload["full_name"].as_str())
    {
        update.insert("full_name", security::sanitize_text(name, 120));
    }
    if let Some(profile_picture) = payload["profile_picture"].as_str() {
        if let Some(cleaned) = security::sanitize_optional_text(Some(profile_picture), 500) {
            update.insert("profile_picture", cleaned);
        }
    }
    if let Some(about_me) = payload["about_me"].as_str() {
        if let Some(cleaned) = security::sanitize_optional_text(Some(about_me), 500) {
            update.insert("about_me", cleaned);
        }
    }

    users
        .update_one(doc! { "_id": oid }, doc! { "$set": update })
        .await?;
    let updated = users
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(Json(sanitize_user(updated)))
}

async fn update_preferences(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<crate::models::user::UserPreferencesUpdate>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;

    let now = Utc::now();
    let pref_str = serde_json::to_string(&security::sanitize_preferences(payload))
        .unwrap_or_else(|_| "{}".into());
    users
        .update_one(
            doc! { "_id": oid },
            doc! { "$set": { "preferences_json": &pref_str, "updated_at": now.to_rfc3339() } },
        )
        .await?;

    Ok(Json(json!({ "message": "Preferences updated" })))
}

async fn change_password(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let current = payload["current_password"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("current_password required".into()))?;
    let new_pw = payload["new_password"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("new_password required".into()))?;

    security::validate_password_strength(new_pw)?;

    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;
    let user = users
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    let hash_stored = user.get_str("password_hash").unwrap_or("");
    if hash_stored.is_empty() {
        return Err(AppError::BadRequest(
            "Cannot change password for OAuth accounts".into(),
        ));
    }

    let valid = verify(current, hash_stored)
        .map_err(|_| AppError::Unauthorized("Invalid current password".into()))?;
    if !valid {
        return Err(AppError::Unauthorized("Invalid current password".into()));
    }

    let new_hash = hash(new_pw, DEFAULT_COST).map_err(|e| AppError::Internal(e.to_string()))?;
    let now = Utc::now();
    users
        .update_one(
            doc! { "_id": oid },
            doc! { "$set": { "password_hash": new_hash, "updated_at": now.to_rfc3339() } },
        )
        .await?;

    Ok(Json(json!({ "message": "Password changed successfully" })))
}

async fn get_user_profile(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = ObjectId::parse_str(&user_id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;
    let user = users
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(Json(sanitize_user(user)))
}

fn sanitize_user(mut doc: Document) -> Value {
    doc.remove("password_hash");
    let id = doc
        .get_object_id("_id")
        .map(|oid| oid.to_hex())
        .or_else(|_| doc.get_str("id").map(String::from))
        .unwrap_or_default();
    let email = doc.get_str("email").unwrap_or_default();
    let name = doc
        .get_str("full_name")
        .or_else(|_| doc.get_str("name"))
        .unwrap_or(email);
    let role = doc.get_str("role").unwrap_or("customer");
    let profile_picture = doc.get_str("profile_picture").ok();
    let about_me = doc.get_str("about_me").ok();
    let created_at = doc.get_str("created_at").ok();
    let subscription_tier = doc.get_str("subscription_tier").ok();

    json!({
        "id": id,
        "_id": id,
        "email": email,
        "name": name,
        "full_name": doc.get_str("full_name").ok(),
        "role": role,
        "profile_picture": profile_picture,
        "about_me": about_me,
        "created_at": created_at,
        "subscription_tier": subscription_tier,
    })
}

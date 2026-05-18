use crate::{
    db::supabase::AuthUserRecord,
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
    let user = state.db.supabase.auth_get_user(&auth_user.id).await?;
    Ok(Json(public_user_json(&user)))
}

async fn update_me(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let current = state.db.supabase.auth_get_user(&auth_user.id).await?;
    let mut user_metadata = current.user_metadata.clone();

    if let Some(name) = payload["name"]
        .as_str()
        .or_else(|| payload["full_name"].as_str())
    {
        let cleaned = security::sanitize_text(name, 120);
        set_metadata(&mut user_metadata, "full_name", json!(cleaned));
        set_metadata(&mut user_metadata, "name", json!(cleaned));
    }
    if let Some(profile_picture) = payload["profile_picture"].as_str() {
        if let Some(cleaned) = security::sanitize_optional_text(Some(profile_picture), 500) {
            set_metadata(&mut user_metadata, "profile_picture", json!(cleaned));
        }
    }
    if let Some(about_me) = payload["about_me"].as_str() {
        if let Some(cleaned) = security::sanitize_optional_text(Some(about_me), 500) {
            set_metadata(&mut user_metadata, "about_me", json!(cleaned));
        }
    }

    let updated = state
        .db
        .supabase
        .auth_update_user(&auth_user.id, json!({ "user_metadata": user_metadata }))
        .await?;
    Ok(Json(public_user_json(&updated)))
}

async fn update_preferences(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<crate::models::user::UserPreferencesUpdate>,
) -> Result<impl IntoResponse> {
    let current = state.db.supabase.auth_get_user(&auth_user.id).await?;
    let mut user_metadata = current.user_metadata.clone();
    set_metadata(
        &mut user_metadata,
        "preferences",
        security::sanitize_preferences(payload),
    );

    let updated = state
        .db
        .supabase
        .auth_update_user(&auth_user.id, json!({ "user_metadata": user_metadata }))
        .await?;

    Ok(Json(public_user_json(&updated)))
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

    state
        .db
        .supabase
        .auth_login_password(&auth_user.email, current)
        .await
        .map_err(|_| AppError::Unauthorized("Invalid current password".into()))?;
    state
        .db
        .supabase
        .auth_update_user(&auth_user.id, json!({ "password": new_pw }))
        .await?;

    Ok(Json(json!({ "message": "Password changed successfully" })))
}

async fn get_user_profile(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse> {
    let user = state.db.supabase.auth_get_user(&user_id).await?;
    Ok(Json(public_user_json(&user)))
}

fn public_user_json(user: &AuthUserRecord) -> Value {
    let email = user.email.as_deref().unwrap_or_default();
    let full_name = metadata_str(&user.user_metadata, "full_name")
        .or_else(|| metadata_str(&user.user_metadata, "name"));
    let name = full_name.unwrap_or(email);
    json!({
        "id": user.id,
        "_id": user.id,
        "email": email,
        "name": name,
        "full_name": full_name,
        "role": metadata_str(&user.app_metadata, "role").unwrap_or("customer"),
        "profile_picture": metadata_str(&user.user_metadata, "profile_picture"),
        "about_me": metadata_str(&user.user_metadata, "about_me"),
        "created_at": user.created_at,
        "subscription_tier": metadata_str(&user.app_metadata, "subscription_tier").unwrap_or("FREE"),
        "preferences": user.user_metadata.get("preferences").cloned().unwrap_or(Value::Null),
    })
}

fn metadata_str<'a>(metadata: &'a Value, key: &str) -> Option<&'a str> {
    metadata.get(key).and_then(Value::as_str)
}

fn set_metadata(metadata: &mut Value, key: &str, value: Value) {
    if !metadata.is_object() {
        *metadata = json!({});
    }
    if let Some(object) = metadata.as_object_mut() {
        object.insert(key.to_string(), value);
    }
}

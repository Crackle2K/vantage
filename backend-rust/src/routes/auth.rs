use crate::{
    errors::{AppError, Result},
    jwt,
    middleware::auth::AuthUser,
    models::user::{GoogleAuthRequest, TokenClaims, UserCreate, UserLogin},
    services::recaptcha,
    state::AppState,
};
use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use mongodb::bson::{doc, Document};
use serde_json::{json, Value};
use std::sync::Arc;
use validator::Validate;

const LOCKOUT_THRESHOLD: i32 = 5;
const LOCKOUT_DURATION_MINUTES: i64 = 15;
const LOCKOUT_WINDOW_MINUTES: i64 = 30;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route("/google", post(google_auth))
}

async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UserCreate>,
) -> Result<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // reCAPTCHA verification
    if let Some(token) = &payload.recaptcha_token {
        if !state.config.recaptcha_api_key.is_empty() {
            recaptcha::verify_recaptcha_token(
                &state.config,
                token,
                "SIGNUP",
            )
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        }
    }

    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");

    // Check for duplicate email
    if users
        .find_one(doc! { "email": payload.email.to_lowercase() })
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let hashed = hash(&payload.password, DEFAULT_COST)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let now = Utc::now();
    let user_doc = doc! {
        "email": payload.email.to_lowercase(),
        "full_name": payload.full_name.clone().unwrap_or_default(),
        "password_hash": hashed,
        "role": "customer",
        "is_active": true,
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
        "preferences": {},
        "subscription_tier": "FREE",
    };

    let result = users.insert_one(user_doc).await?;
    let user_id = result.inserted_id.as_object_id().map(|o| o.to_hex()).unwrap_or_default();

    let token = create_jwt(&user_id, &payload.email.to_lowercase(), "customer", &state.config.secret_key)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": payload.email.to_lowercase(),
                "full_name": payload.full_name,
                "role": "customer",
                "subscription_tier": "FREE",
            }
        })),
    ))
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UserLogin>,
) -> Result<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let email_lower = payload.email.to_lowercase();
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");

    let user = users
        .find_one(doc! { "email": &email_lower })
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid credentials".into()))?;

    let password_hash = user.get_str("password_hash").unwrap_or("");
    let is_valid = verify(&payload.password, password_hash)
        .map_err(|_| AppError::Unauthorized("Invalid credentials".into()))?;

    if !is_valid {
        return Err(AppError::Unauthorized("Invalid credentials".into()));
    }

    let user_id = user
        .get_object_id("_id")
        .map(|o| o.to_hex())
        .unwrap_or_default();
    let role = user.get_str("role").unwrap_or("customer");
    let full_name = user.get_str("full_name").ok().map(String::from);
    let subscription_tier = user.get_str("subscription_tier").unwrap_or("FREE").to_string();

    let token = create_jwt(&user_id, &email_lower, role, &state.config.secret_key)?;

    Ok(Json(json!({
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": email_lower,
            "full_name": full_name,
            "role": role,
            "subscription_tier": subscription_tier,
        }
    })))
}

async fn logout() -> impl IntoResponse {
    Json(json!({ "message": "Logged out successfully" }))
}

async fn me(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let user = users
        .find_one(doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(&auth_user.id).unwrap_or_default() })
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    let email = user.get_str("email").unwrap_or("").to_string();
    let full_name = user.get_str("full_name").ok().map(String::from);
    let role = user.get_str("role").unwrap_or("customer").to_string();
    let subscription_tier = user.get_str("subscription_tier").unwrap_or("FREE").to_string();
    let profile_picture = user.get_str("profile_picture").ok().map(String::from);

    Ok(Json(json!({
        "id": auth_user.id,
        "email": email,
        "full_name": full_name,
        "role": role,
        "subscription_tier": subscription_tier,
        "profile_picture": profile_picture,
    })))
}

async fn google_auth(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GoogleAuthRequest>,
) -> Result<impl IntoResponse> {
    // Verify Google ID token
    let google_user = verify_google_token(&payload.credential, &state.config.google_client_id)
        .await
        .map_err(|e| AppError::Unauthorized(format!("Invalid Google token: {}", e)))?;

    let email = google_user["email"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("No email in Google token".into()))?
        .to_lowercase();
    let name = google_user["name"].as_str().map(String::from);
    let picture = google_user["picture"].as_str().map(String::from);
    let google_id = google_user["sub"].as_str().unwrap_or("").to_string();

    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let now = Utc::now();

    let existing = users.find_one(doc! { "email": &email }).await?;

    let (user_id, role, subscription_tier) = if let Some(user) = existing {
        let id = user.get_object_id("_id").map(|o| o.to_hex()).unwrap_or_default();
        let r = user.get_str("role").unwrap_or("customer").to_string();
        let tier = user.get_str("subscription_tier").unwrap_or("FREE").to_string();
        // Update google_id and profile_picture
        users
            .update_one(
                doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(&id).unwrap_or_default() },
                doc! { "$set": { "google_id": &google_id, "profile_picture": picture.clone().unwrap_or_default(), "updated_at": now.to_rfc3339() } },
            )
            .await?;
        (id, r, tier)
    } else {
        let user_doc = doc! {
            "email": &email,
            "full_name": name.clone().unwrap_or_default(),
            "google_id": &google_id,
            "profile_picture": picture.clone().unwrap_or_default(),
            "role": "customer",
            "is_active": true,
            "created_at": now.to_rfc3339(),
            "updated_at": now.to_rfc3339(),
            "preferences": {},
            "subscription_tier": "FREE",
        };
        let result = users.insert_one(user_doc).await?;
        let id = result.inserted_id.as_object_id().map(|o| o.to_hex()).unwrap_or_default();
        (id, "customer".into(), "FREE".into())
    };

    let token = create_jwt(&user_id, &email, &role, &state.config.secret_key)?;

    Ok(Json(json!({
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": email,
            "full_name": name,
            "role": role,
            "profile_picture": picture,
            "subscription_tier": subscription_tier,
        }
    })))
}

fn create_jwt(user_id: &str, email: &str, role: &str, secret: &str) -> Result<String> {
    let now = Utc::now().timestamp();
    let claims = TokenClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        role: role.to_string(),
        exp: now + 30 * 60,
        iat: now,
    };
    jwt::encode(&claims, secret)
}

async fn verify_google_token(credential: &str, client_id: &str) -> anyhow::Result<Value> {
    // Decode the JWT without verification first to get kid, then verify with Google certs
    // For simplicity, use Google's tokeninfo endpoint for validation
    let url = format!(
        "https://oauth2.googleapis.com/tokeninfo?id_token={}",
        credential
    );
    let resp = reqwest::get(&url).await?;
    if !resp.status().is_success() {
        anyhow::bail!("Google token verification failed");
    }
    let info: Value = resp.json().await?;

    // Verify audience
    let aud = info["aud"].as_str().unwrap_or("");
    if !client_id.is_empty() && aud != client_id {
        anyhow::bail!("Token audience mismatch");
    }

    Ok(info)
}

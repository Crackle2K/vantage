use crate::{
    errors::{AppError, Result},
    jwt,
    middleware::auth::AuthUser,
    models::user::{GoogleAuthRequest, TokenClaims, UserCreate, UserLogin, UserRole},
    security,
    services::recaptcha,
    state::AppState,
};
use axum::{
    extract::State,
    http::{header::SET_COOKIE, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use mongodb::bson::{doc, Document};
use serde_json::{json, Value};
use std::sync::Arc;
use validator::Validate;

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
    security::validate_password_strength(&payload.password)?;

    if state.config.recaptcha_enabled() {
        let token = payload
            .recaptcha_token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty() && *token != "recaptcha-not-configured")
            .ok_or_else(|| AppError::BadRequest("reCAPTCHA token required".into()))?;

        recaptcha::verify_recaptcha_token(
            &state.config,
            token,
            &state.config.recaptcha_signup_action,
        )
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    }

    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let email = payload.email.trim().to_lowercase();
    let role = registration_role(payload.role.as_ref())?;

    // Check for duplicate email
    if users.find_one(doc! { "email": &email }).await?.is_some() {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let hashed =
        hash(&payload.password, DEFAULT_COST).map_err(|e| AppError::Internal(e.to_string()))?;

    let now = Utc::now();
    let full_name = security::sanitize_optional_text(payload.full_name.as_deref(), 120);
    let user_doc = doc! {
        "email": &email,
        "full_name": full_name.clone().unwrap_or_default(),
        "password_hash": hashed,
        "role": role,
        "is_active": true,
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
        "preferences": {},
        "subscription_tier": "FREE",
    };

    let result = users.insert_one(user_doc).await?;
    let user_id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    let token = create_jwt(&user_id, &email, role, &state.config)?;
    let cookie = session_cookie(&token, &state.config);

    Ok((
        StatusCode::CREATED,
        [(SET_COOKIE, cookie)],
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "user": public_user_json(
                &user_id,
                &email,
                full_name.as_deref(),
                role,
                "FREE",
                None,
            ),
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
    let subscription_tier = user
        .get_str("subscription_tier")
        .unwrap_or("FREE")
        .to_string();

    let token = create_jwt(&user_id, &email_lower, role, &state.config)?;
    let cookie = session_cookie(&token, &state.config);

    Ok((
        [(SET_COOKIE, cookie)],
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "user": public_user_json(
                &user_id,
                &email_lower,
                full_name.as_deref(),
                role,
                &subscription_tier,
                None,
            ),
        })),
    ))
}

async fn logout(State(state): State<Arc<AppState>>) -> Response {
    let is_prod = state.config.is_production();
    let clear = format!(
        "session=; Path=/; HttpOnly; SameSite=Lax{}; Max-Age=0",
        if is_prod { "; Secure" } else { "" }
    );
    (
        [(SET_COOKIE, clear)],
        Json(json!({ "message": "Logged out successfully" })),
    )
        .into_response()
}

async fn me(State(state): State<Arc<AppState>>, auth_user: AuthUser) -> Result<impl IntoResponse> {
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    let oid = mongodb::bson::oid::ObjectId::parse_str(&auth_user.id)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;
    let user = users
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    let email = user.get_str("email").unwrap_or("").to_string();
    let full_name = user
        .get_str("full_name")
        .or_else(|_| user.get_str("name"))
        .ok()
        .map(String::from);
    let role = user.get_str("role").unwrap_or("customer").to_string();
    let subscription_tier = user
        .get_str("subscription_tier")
        .unwrap_or("FREE")
        .to_string();
    let profile_picture = user.get_str("profile_picture").ok().map(String::from);

    Ok(Json(public_user_json(
        &auth_user.id,
        &email,
        full_name.as_deref(),
        &role,
        &subscription_tier,
        profile_picture.as_deref(),
    )))
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
        let id = user
            .get_object_id("_id")
            .map(|o| o.to_hex())
            .unwrap_or_default();
        let r = user.get_str("role").unwrap_or("customer").to_string();
        let tier = user
            .get_str("subscription_tier")
            .unwrap_or("FREE")
            .to_string();
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
        let id = result
            .inserted_id
            .as_object_id()
            .map(|o| o.to_hex())
            .unwrap_or_default();
        (id, "customer".into(), "FREE".into())
    };

    let token = create_jwt(&user_id, &email, &role, &state.config)?;
    let cookie = session_cookie(&token, &state.config);

    Ok((
        [(SET_COOKIE, cookie)],
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "user": public_user_json(
                &user_id,
                &email,
                name.as_deref(),
                &role,
                &subscription_tier,
                picture.as_deref(),
            ),
        })),
    ))
}

fn session_cookie(token: &str, config: &crate::config::Config) -> String {
    let is_prod = config.is_production();
    let expires = 60 * 60 * 24 * config.refresh_token_expire_days;
    format!(
        "session={}; Path=/; HttpOnly; SameSite=Lax{}; Max-Age={}",
        token,
        if is_prod { "; Secure" } else { "" },
        expires
    )
}

fn create_jwt(
    user_id: &str,
    email: &str,
    role: &str,
    config: &crate::config::Config,
) -> Result<String> {
    let now = Utc::now().timestamp();
    let claims = TokenClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        role: role.to_string(),
        exp: now + config.access_token_expire_minutes * 60,
        iat: now,
    };
    jwt::encode(&claims, &config.secret_key)
}

async fn verify_google_token(credential: &str, client_id: &str) -> anyhow::Result<Value> {
    if client_id.trim().is_empty() {
        anyhow::bail!("Google OAuth is not configured");
    }

    // Decode the JWT without verification first to get kid, then verify with Google certs
    // For simplicity, use Google's tokeninfo endpoint for validation
    let url = format!(
        "https://oauth2.googleapis.com/tokeninfo?id_token={}",
        urlencoding::encode(credential)
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let resp = client.get(&url).send().await?;
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

fn registration_role(role: Option<&UserRole>) -> Result<&'static str> {
    match role.unwrap_or(&UserRole::Customer) {
        UserRole::Customer => Ok("customer"),
        UserRole::BusinessOwner => Ok("business_owner"),
        UserRole::Admin => Err(AppError::Forbidden(
            "Admin accounts cannot be self-registered".into(),
        )),
    }
}

fn public_user_json(
    id: &str,
    email: &str,
    full_name: Option<&str>,
    role: &str,
    subscription_tier: &str,
    profile_picture: Option<&str>,
) -> Value {
    let name = full_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(email);

    json!({
        "id": id,
        "_id": id,
        "email": email,
        "name": name,
        "full_name": full_name,
        "role": role,
        "profile_picture": profile_picture,
        "subscription_tier": subscription_tier,
    })
}

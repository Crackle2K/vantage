use crate::{
    db::supabase::AuthUserRecord,
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
use chrono::Utc;
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

    let email = payload.email.trim().to_lowercase();
    let role = registration_role(payload.role.as_ref())?;

    let full_name = security::sanitize_optional_text(payload.full_name.as_deref(), 120);
    let user = state
        .db
        .supabase
        .auth_create_user(
            &email,
            &payload.password,
            json!({
                "full_name": full_name,
                "name": full_name,
                "profile_picture": Value::Null,
                "auth_provider": "email",
            }),
            json!({
                "role": role,
                "subscription_tier": "FREE",
            }),
        )
        .await
        .map_err(map_supabase_auth_error)?;

    let token = create_jwt(&user.id, &email, role, &state.config)?;
    let cookie = session_cookie(&token, &state.config);

    Ok((
        StatusCode::CREATED,
        [(SET_COOKIE, cookie)],
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "user": public_user_json(&user),
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

    let email = payload.email.trim().to_lowercase();
    let session = state
        .db
        .supabase
        .auth_login_password(&email, &payload.password)
        .await
        .map_err(|_| AppError::Unauthorized("Invalid credentials".into()))?;
    let role = metadata_str(&session.user.app_metadata, "role").unwrap_or("customer");

    let token = create_jwt(&session.user.id, &email, role, &state.config)?;
    let cookie = session_cookie(&token, &state.config);

    Ok((
        [(SET_COOKIE, cookie)],
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "supabase_access_token": session.access_token,
            "user": public_user_json(&session.user),
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
    let user = state
        .db
        .supabase
        .auth_get_user(&auth_user.id)
        .await
        .map_err(map_supabase_auth_error)?;

    Ok(Json(public_user_json(&user)))
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

    let user = if let Some(existing) = state
        .db
        .supabase
        .auth_find_user_by_email(&email)
        .await
        .map_err(map_supabase_auth_error)?
    {
        let mut user_metadata = existing.user_metadata.clone();
        merge_metadata(
            &mut user_metadata,
            json!({
                "full_name": name,
                "name": name,
                "profile_picture": picture,
                "google_id": google_id,
                "auth_provider": "google",
            }),
        );
        state
            .db
            .supabase
            .auth_update_user(
                &existing.id,
                json!({
                    "user_metadata": user_metadata,
                }),
            )
            .await
            .map_err(map_supabase_auth_error)?
    } else {
        let generated_password =
            format!("{}-{}-OAuth!", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
        state
            .db
            .supabase
            .auth_create_user(
                &email,
                &generated_password,
                json!({
                    "full_name": name,
                    "name": name,
                    "profile_picture": picture,
                    "google_id": google_id,
                    "auth_provider": "google",
                }),
                json!({
                    "role": "customer",
                    "subscription_tier": "FREE",
                }),
            )
            .await
            .map_err(map_supabase_auth_error)?
    };

    let role = metadata_str(&user.app_metadata, "role").unwrap_or("customer");
    let token = create_jwt(&user.id, &email, role, &state.config)?;
    let cookie = session_cookie(&token, &state.config);

    Ok((
        [(SET_COOKIE, cookie)],
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
            "user": public_user_json(&user),
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

fn public_user_json(user: &AuthUserRecord) -> Value {
    let email = user.email.as_deref().unwrap_or_default();
    let full_name = metadata_str(&user.user_metadata, "full_name")
        .or_else(|| metadata_str(&user.user_metadata, "name"));
    let name = full_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(email);
    let role = metadata_str(&user.app_metadata, "role").unwrap_or("customer");
    let subscription_tier = metadata_str(&user.app_metadata, "subscription_tier").unwrap_or("FREE");
    let profile_picture = metadata_str(&user.user_metadata, "profile_picture");
    let preferences = user
        .user_metadata
        .get("preferences")
        .unwrap_or(&Value::Null);

    json!({
        "id": user.id,
        "_id": user.id,
        "email": email,
        "name": name,
        "full_name": full_name,
        "role": role,
        "profile_picture": profile_picture,
        "subscription_tier": subscription_tier,
        "created_at": user.created_at,
        "auth_provider": metadata_str(&user.user_metadata, "auth_provider"),
        "preferences": preferences,
        "preferred_categories": preferences.get("preferred_categories").cloned().unwrap_or(Value::Null),
        "preferred_vibes": preferences.get("preferred_vibes").cloned().unwrap_or(Value::Null),
        "prefer_independent": preferences.get("prefer_independent").cloned().unwrap_or(Value::Null),
        "price_pref": preferences.get("price_pref").cloned().unwrap_or(Value::Null),
        "discovery_mode": preferences.get("discovery_mode").cloned().unwrap_or(Value::Null),
        "preferences_completed": preferences.get("preferences_completed").cloned().unwrap_or(Value::Null),
    })
}

fn metadata_str<'a>(metadata: &'a Value, key: &str) -> Option<&'a str> {
    metadata.get(key).and_then(Value::as_str)
}

fn merge_metadata(target: &mut Value, patch: Value) {
    let Some(target) = target.as_object_mut() else {
        *target = json!({});
        return merge_metadata(target, patch);
    };
    if let Some(patch) = patch.as_object() {
        for (key, value) in patch {
            if !value.is_null() {
                target.insert(key.clone(), value.clone());
            }
        }
    }
}

fn map_supabase_auth_error(error: anyhow::Error) -> AppError {
    let message = error.to_string();
    let lowered = message.to_ascii_lowercase();
    if lowered.contains("already") || lowered.contains("registered") || lowered.contains("exists") {
        AppError::Conflict("Email already registered".into())
    } else if lowered.contains("not configured") {
        AppError::Internal("Supabase is not configured".into())
    } else if lowered.contains("invalid login") || lowered.contains("invalid credentials") {
        AppError::Unauthorized("Invalid credentials".into())
    } else {
        AppError::Internal("Authentication service unavailable".into())
    }
}

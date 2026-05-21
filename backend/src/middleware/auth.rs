use crate::{
    config::Config, db::supabase::AuthSession, errors::AppError, jwt,
    models::user::SupabaseJwtClaims, security, state::AppState,
};
use async_trait::async_trait;
use axum::http::HeaderValue;
use axum::{
    body::Body,
    extract::{FromRequestParts, Request, State},
    http::header::{AUTHORIZATION, COOKIE, SET_COOKIE},
    http::request::Parts,
    middleware::Next,
    response::Response,
};
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: String,
}

impl AuthUser {
    pub fn display_name(&self) -> &str {
        if !self.name.trim().is_empty() {
            &self.name
        } else {
            "Vantage user"
        }
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<AuthUser>()
            .cloned()
            .ok_or_else(|| AppError::Unauthorized("Not authenticated".into()))
    }
}

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let tokens = extract_tokens(&req);
    if tokens.access_token.is_none() && tokens.refresh_token.is_none() {
        return Err(AppError::Unauthorized("Not authenticated".into()));
    }

    let (auth_user, refreshed) = authenticate_tokens(&state, tokens).await?;
    req.extensions_mut().insert(auth_user);

    let mut response = next.run(req).await;
    if let Some(session) = refreshed {
        append_session_cookies(&mut response, &session, &state.config);
    }
    Ok(response)
}

pub async fn optional_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let tokens = extract_tokens(&req);
    let refreshed = if tokens.access_token.is_some() || tokens.refresh_token.is_some() {
        match authenticate_tokens(&state, tokens).await {
            Ok((auth_user, refreshed)) => {
                req.extensions_mut().insert(auth_user);
                refreshed
            }
            Err(_) => None,
        }
    } else {
        None
    };

    let mut response = next.run(req).await;
    if let Some(session) = refreshed {
        append_session_cookies(&mut response, &session, &state.config);
    }
    response
}

struct RequestTokens {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

fn extract_tokens(req: &Request<Body>) -> RequestTokens {
    let mut tokens = RequestTokens {
        access_token: None,
        refresh_token: None,
    };

    if let Some(header) = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(token) = header.strip_prefix("Bearer ") {
            tokens.access_token = Some(token.to_string());
        }
    }

    if let Some(cookie_header) = req.headers().get(COOKIE).and_then(|v| v.to_str().ok()) {
        for part in cookie_header.split(';') {
            let part = part.trim();
            if let Some(value) = part.strip_prefix("session=") {
                tokens.access_token = Some(value.to_string());
            } else if let Some(value) = part.strip_prefix("refresh_token=") {
                tokens.refresh_token = Some(value.to_string());
            }
        }
    }

    tokens
}

async fn authenticate_tokens(
    state: &AppState,
    tokens: RequestTokens,
) -> Result<(AuthUser, Option<AuthSession>), AppError> {
    if let Some(token) = tokens.access_token.as_deref() {
        if let Ok(claims) = verify_token(token, &state.config.supabase_jwt_secret) {
            return Ok((claims_to_auth_user(claims)?, None));
        }
    }

    let Some(refresh_token) = tokens.refresh_token else {
        return Err(AppError::Unauthorized("Not authenticated".into()));
    };

    let session = state
        .db
        .supabase
        .auth_refresh_token(&refresh_token)
        .await
        .map_err(|_| AppError::Unauthorized("Session expired".into()))?;
    let claims = verify_token(&session.access_token, &state.config.supabase_jwt_secret)?;
    Ok((claims_to_auth_user(claims)?, Some(session)))
}

pub fn verify_token(token: &str, secret: &str) -> Result<SupabaseJwtClaims, AppError> {
    jwt::decode(token, secret)
}

fn claims_to_auth_user(claims: SupabaseJwtClaims) -> Result<AuthUser, AppError> {
    let id = security::validate_uuid_id(&claims.sub, "user ID")?;
    let email = claims
        .email
        .or_else(|| metadata_string(&claims.user_metadata, "email"))
        .unwrap_or_default();
    let name = metadata_string(&claims.user_metadata, "full_name")
        .or_else(|| metadata_string(&claims.user_metadata, "name"))
        .unwrap_or_default();
    let role = metadata_string(&claims.app_metadata, "role")
        .filter(|role| matches!(role.as_str(), "customer" | "business_owner" | "admin"))
        .unwrap_or_else(|| "customer".to_string());

    Ok(AuthUser {
        id,
        email,
        name,
        role,
    })
}

fn metadata_string(metadata: &Value, key: &str) -> Option<String> {
    metadata
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub fn session_cookies(session: &AuthSession, config: &Config) -> Vec<String> {
    let attrs = cookie_attrs(config);
    let access_max_age = session.expires_in.unwrap_or(3600).clamp(60, 86_400);
    let mut cookies = vec![format!(
        "session={}; {}; Max-Age={}",
        session.access_token, attrs, access_max_age
    )];

    if let Some(refresh_token) = session
        .refresh_token
        .as_deref()
        .filter(|token| !token.trim().is_empty())
    {
        let refresh_max_age = 60 * 60 * 24 * config.refresh_token_expire_days;
        cookies.push(format!(
            "refresh_token={}; {}; Max-Age={}",
            refresh_token, attrs, refresh_max_age
        ));
    }

    cookies
}

pub fn clear_session_cookies(config: &Config) -> Vec<String> {
    let attrs = cookie_attrs(config);
    vec![
        format!("session=; {}; Max-Age=0", attrs),
        format!("refresh_token=; {}; Max-Age=0", attrs),
    ]
}

fn append_session_cookies(response: &mut Response, session: &AuthSession, config: &Config) {
    for cookie in session_cookies(session, config) {
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            response.headers_mut().append(SET_COOKIE, value);
        }
    }
}

fn cookie_attrs(config: &Config) -> String {
    format!(
        "Path=/; HttpOnly; SameSite=Lax{}",
        if config.is_production() {
            "; Secure"
        } else {
            ""
        }
    )
}

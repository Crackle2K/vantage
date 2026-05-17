use crate::{errors::AppError, jwt, models::user::TokenClaims, state::AppState};
use async_trait::async_trait;
use axum::{
    body::Body,
    extract::{FromRequestParts, Request, State},
    http::header::{AUTHORIZATION, COOKIE},
    http::request::Parts,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub role: String,
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
    let token = extract_token(&req)?;
    let claims = verify_token(&token, &state.config.secret_key)?;

    req.extensions_mut().insert(AuthUser {
        id: claims.sub.clone(),
        email: claims.email.clone(),
        role: claims.role.clone(),
    });

    Ok(next.run(req).await)
}

pub async fn optional_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    if let Ok(token) = extract_token(&req) {
        if let Ok(claims) = verify_token(&token, &state.config.secret_key) {
            req.extensions_mut().insert(AuthUser {
                id: claims.sub.clone(),
                email: claims.email.clone(),
                role: claims.role.clone(),
            });
        }
    }
    next.run(req).await
}

fn extract_token(req: &Request<Body>) -> Result<String, AppError> {
    // 1. Try Authorization: Bearer <token> header
    if let Some(header) = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(token) = header.strip_prefix("Bearer ") {
            return Ok(token.to_string());
        }
    }

    // 2. Fall back to session cookie (httpOnly, set by login/register/google-auth)
    if let Some(cookie_header) = req.headers().get(COOKIE).and_then(|v| v.to_str().ok()) {
        for part in cookie_header.split(';') {
            let part = part.trim();
            if let Some(value) = part.strip_prefix("session=") {
                return Ok(value.to_string());
            }
        }
    }

    Err(AppError::Unauthorized("Not authenticated".into()))
}

pub fn verify_token(token: &str, secret: &str) -> Result<TokenClaims, AppError> {
    jwt::decode(token, secret)
}

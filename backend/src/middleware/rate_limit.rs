use crate::{errors::AppError, state::AppState};
use axum::{
    body::Body,
    extract::State,
    http::{header::HeaderName, Request},
    middleware::Next,
    response::Response,
};
use std::{sync::Arc, time::Duration};

pub async fn rate_limit(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let path = req.uri().path();
    if path == "/health" || path == "/" {
        return Ok(next.run(req).await);
    }

    let key = client_key(&req);
    let limit = auth_sensitive_limit(path, state.config.rate_limit_per_minute);
    let allowed = state
        .rate_limiter
        .check(&key, limit, Duration::from_secs(60))
        .await;

    if !allowed {
        return Err(AppError::RateLimited);
    }

    Ok(next.run(req).await)
}

fn auth_sensitive_limit(path: &str, default_limit: u32) -> u32 {
    if path.starts_with("/api/auth/login")
        || path.starts_with("/api/auth/register")
        || path.starts_with("/api/auth/google")
    {
        return default_limit.min(20);
    }
    default_limit
}

fn client_key(req: &Request<Body>) -> String {
    for name in ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] {
        if let Some(value) = req
            .headers()
            .get(HeaderName::from_static(name))
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            return value.chars().take(64).collect();
        }
    }

    "unknown-client".to_string()
}

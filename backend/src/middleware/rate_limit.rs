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
    // x-real-ip is set by trusted infrastructure (nginx, Vercel edge).
    // cf-connecting-ip is omitted: this app runs on Vercel, not Cloudflare,
    // so that header is not stripped and can be spoofed by clients.
    if let Some(value) = header_ip(req, "x-real-ip", HeaderIpPosition::First) {
        return value;
    }

    if let Some(value) = header_ip(req, "x-forwarded-for", HeaderIpPosition::Last) {
        return value;
    }

    "unknown-client".to_string()
}

enum HeaderIpPosition {
    First,
    Last,
}

fn header_ip(
    req: &Request<Body>,
    name: &'static str,
    position: HeaderIpPosition,
) -> Option<String> {
    let header = req
        .headers()
        .get(HeaderName::from_static(name))
        .and_then(|value| value.to_str().ok())?;
    let value = match position {
        HeaderIpPosition::First => header.split(',').next(),
        HeaderIpPosition::Last => header.split(',').next_back(),
    }?
    .trim();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(64).collect())
}

#[cfg(test)]
mod tests {
    use super::client_key;
    use axum::{body::Body, http::Request};

    #[test]
    fn x_forwarded_for_uses_rightmost_ip() {
        let request = Request::builder()
            .header("x-forwarded-for", "203.0.113.10, 198.51.100.20")
            .body(Body::empty())
            .unwrap();

        assert_eq!(client_key(&request), "198.51.100.20");
    }

    #[test]
    fn x_real_ip_takes_precedence_over_forwarded_for() {
        let request = Request::builder()
            .header("x-real-ip", "203.0.113.30")
            .header("x-forwarded-for", "203.0.113.10, 198.51.100.20")
            .body(Body::empty())
            .unwrap();

        assert_eq!(client_key(&request), "203.0.113.30");
    }

    #[test]
    fn cf_connecting_ip_is_not_trusted_without_cloudflare() {
        let request = Request::builder()
            .header("cf-connecting-ip", "1.2.3.4")
            .header("x-forwarded-for", "203.0.113.10, 198.51.100.20")
            .body(Body::empty())
            .unwrap();

        // cf-connecting-ip must not be used: this app runs on Vercel, not
        // Cloudflare, so the header is spoofable by clients.
        assert_ne!(client_key(&request), "1.2.3.4");
    }
}

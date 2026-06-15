use axum::{
    body::Body,
    extract::Request,
    http::{HeaderValue, Method},
    middleware::Next,
    response::Response,
};

pub async fn add_security_headers(req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().clone();

    let mut response = next.run(req).await;

    let headers = response.headers_mut();
    if is_production_env() {
        headers.insert(
            "Strict-Transport-Security",
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        );
    }
    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert("X-XSS-Protection", HeaderValue::from_static("0"));
    headers.insert(
        "Referrer-Policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "Permissions-Policy",
        HeaderValue::from_static("geolocation=(self), microphone=(), camera=()"),
    );

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let is_html = content_type.starts_with("text/html");
    let is_docs_path = matches!(path.as_str(), "/docs" | "/redoc" | "/swagger-ui");

    if is_html && !is_docs_path {
        response.headers_mut().insert(
            "Content-Security-Policy",
            HeaderValue::from_static(
                "default-src 'self'; \
                     script-src 'self' 'unsafe-inline' https://accounts.google.com https://www.google.com https://www.gstatic.com; \
                     style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
                     img-src 'self' data: https: blob:; \
                     font-src 'self' https://fonts.gstatic.com; \
                     connect-src 'self' https://accounts.google.com https://www.google.com https://www.gstatic.com https://*.supabase.co wss://*.supabase.co; \
                     frame-src https://accounts.google.com https://www.google.com; \
                     form-action 'self'; \
                     frame-ancestors 'none'",
            ),
        );
    }

    let is_json = content_type.starts_with("application/json");
    let is_api_path = path.starts_with("/api/");
    let is_private_api = is_private_api_path(&path);

    if is_json && is_api_path && is_private_api && !response.headers().contains_key("cache-control")
    {
        response.headers_mut().insert(
            "Cache-Control",
            HeaderValue::from_static("no-store, max-age=0"),
        );
    }

    if method == Method::GET
        && is_json
        && is_api_path
        && !is_private_api
        && !response.headers().contains_key("cache-control")
    {
        response.headers_mut().insert(
            "Cache-Control",
            HeaderValue::from_static("public, max-age=30, s-maxage=60, stale-while-revalidate=60"),
        );
    }

    response
}

fn is_production_env() -> bool {
    let raw = std::env::var("ENVIRONMENT")
        .or_else(|_| std::env::var("VERCEL_ENV"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(raw.as_str(), "prod" | "production")
}

fn is_private_api_path(path: &str) -> bool {
    path.starts_with("/api/auth")
        || path.starts_with("/api/users")
        || path.starts_with("/api/saved")
        || path.starts_with("/api/claims")
        || path.starts_with("/api/subscriptions/my")
        || path.starts_with("/api/subscriptions/mine")
        || path.starts_with("/api/subscriptions/business")
        || path.starts_with("/api/credibility/me")
}

#[cfg(test)]
mod tests {
    use super::is_private_api_path;

    #[test]
    fn private_api_path_detection_covers_owner_and_user_data() {
        assert!(is_private_api_path("/api/claims/my"));
        assert!(is_private_api_path(
            "/api/subscriptions/business/550e8400-e29b-41d4-a716-446655440000"
        ));
        assert!(is_private_api_path("/api/saved"));
        assert!(!is_private_api_path("/api/subscriptions/tiers"));
        assert!(!is_private_api_path("/api/discover"));
    }
}

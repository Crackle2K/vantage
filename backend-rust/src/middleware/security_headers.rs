use axum::{
    body::Body,
    extract::Request,
    http::{HeaderValue, Method},
    middleware::Next,
    response::Response,
};

pub async fn add_security_headers(req: Request<Body>, next: Next) -> Response {
    let host = req
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_string();

    let path = req.uri().path().to_string();
    let method = req.method().clone();

    let mut response = next.run(req).await;

    let is_localhost = matches!(host.as_str(), "localhost" | "127.0.0.1");

    if !is_localhost {
        let headers = response.headers_mut();
        headers.insert(
            "Strict-Transport-Security",
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        );
        headers.insert(
            "X-Content-Type-Options",
            HeaderValue::from_static("nosniff"),
        );
        headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
        headers.insert(
            "X-XSS-Protection",
            HeaderValue::from_static("1; mode=block"),
        );
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
                     script-src 'self' 'unsafe-inline' https://accounts.google.com; \
                     style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
                     img-src 'self' data: https: blob:; \
                     font-src 'self' https://fonts.gstatic.com; \
                     connect-src 'self' https://accounts.google.com; \
                     frame-ancestors 'none'",
                ),
            );
        }

        let is_json = content_type.starts_with("application/json");
        let is_api_path = path.starts_with("/api/");
        let is_auth_or_private = path.starts_with("/api/auth")
            || path.starts_with("/api/users")
            || path.starts_with("/api/saved");

        if method == Method::GET && is_json && is_api_path && !is_auth_or_private {
            if !response.headers().contains_key("cache-control") {
                response.headers_mut().insert(
                    "Cache-Control",
                    HeaderValue::from_static(
                        "public, max-age=30, s-maxage=60, stale-while-revalidate=60",
                    ),
                );
            }
        }
    }

    response
}

#![allow(dead_code)]

pub mod config;
pub mod db;
pub mod errors;
pub mod jwt;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod security;
pub mod services;
pub mod state;

use axum::{middleware as axum_middleware, routing::get, Router};
use config::Config;
use db::Database;
use state::AppState;
use std::sync::Arc;
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

pub async fn build_app() -> anyhow::Result<Router> {
    dotenvy::dotenv().ok();
    if std::path::Path::new("backend/.env").exists() {
        dotenvy::from_filename("backend/.env").ok();
    }

    let config = Config::from_env();
    config.validate()?;
    let db = Database::new(&config).await;
    let state = Arc::new(AppState::new(config.clone(), db)?);

    Ok(build_router(state))
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let origins: Vec<axum::http::HeaderValue> = state
        .config
        .allowed_origins()
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods(AllowMethods::list([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::PATCH,
            axum::http::Method::OPTIONS,
        ]))
        .allow_headers(AllowHeaders::list([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]))
        .allow_credentials(true);

    Router::new()
        .route("/", get(root))
        .route("/api", get(root))
        .route("/health", get(health_check))
        .route("/api/health", get(health_check))
        .nest("/api/auth", routes::auth::router())
        .nest("/api", routes::businesses::router())
        .nest("/api", routes::reviews::router())
        .nest("/api", routes::deals::router())
        .nest("/api", routes::claims::router())
        .nest("/api", routes::subscriptions::router())
        .nest("/api", routes::activity::router())
        .nest("/api", routes::discovery::router())
        .nest("/api", routes::location::router())
        .nest("/api", routes::saved::router())
        .nest("/api/users", routes::users::router())
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::optional_auth,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::rate_limit::rate_limit,
        ))
        .layer(axum_middleware::from_fn(
            middleware::security_headers::add_security_headers,
        ))
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn root() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "message": "Vantage API running",
        "status": "active",
        "version": "1.0.0",
    }))
}

async fn health_check(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> axum::Json<serde_json::Value> {
    let db_ok = state.db.supabase.health_check().await.is_ok();

    let status = if db_ok { "ok" } else { "degraded" };

    axum::Json(serde_json::json!({
        "status": status,
        "version": "1.0.0",
        "checks": {
            "supabase": if db_ok { "ok" } else { "error" }
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{header, Method, Request, StatusCode},
    };
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use hmac::{Hmac, Mac};
    use serde_json::{json, Value};
    use sha2::Sha256;
    use tower::ServiceExt;

    type HmacSha256 = Hmac<Sha256>;

    fn test_config() -> Config {
        Config {
            refresh_token_expire_days: 7,
            google_api_key: String::new(),
            recaptcha_project_id: String::new(),
            recaptcha_api_key: String::new(),
            recaptcha_site_key: String::new(),
            recaptcha_signup_action: "SIGNUP".into(),
            recaptcha_min_score: 0.5,
            recaptcha_verify_timeout_secs: 10,
            api_url: "http://localhost:8000".into(),
            frontend_url: "http://localhost:5173".into(),
            production_url: String::new(),
            environment: "test".into(),
            rate_limit_per_minute: 120,
            supabase_url: String::new(),
            supabase_service_role_key: "test-service-role-key".into(),
            supabase_jwt_secret: "test-supabase-jwt-secret".into(),
            stripe_secret_key: String::new(),
            stripe_webhook_secret: String::new(),
            demo_mode: false,
            demo_lat: 37.7749,
            demo_lng: -122.4194,
        }
    }

    fn test_state() -> Arc<AppState> {
        let config = test_config();
        let db = Database {
            supabase: db::SupabaseClient::new(&config),
        };
        Arc::new(AppState::new(config, db).unwrap())
    }

    #[test]
    fn router_builds_without_route_conflicts() {
        let _router = build_router(test_state());
    }

    #[tokio::test]
    async fn invalid_business_id_returns_bad_request_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/api/businesses/not-a-uuid")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn invalid_reverse_geocode_coordinates_return_bad_request() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/api/location/reverse?lat=999&lng=0")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn invalid_public_user_id_returns_bad_request_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/api/users/not-a-uuid")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn protected_routes_require_authentication_before_database() {
        let cases = [
            (Method::GET, "/api/auth/me", Value::Null),
            (Method::GET, "/api/saved", Value::Null),
            (Method::GET, "/api/subscriptions/my", Value::Null),
            (Method::POST, "/api/reviews", json!({})),
            (Method::POST, "/api/checkins", json!({})),
            (Method::POST, "/api/feed/posts", json!({})),
            (
                Method::POST,
                "/api/feed/550e8400-e29b-41d4-a716-446655440000/like",
                Value::Null,
            ),
        ];

        for (method, uri, body) in cases {
            let response = send(method, uri, body, None).await;
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{uri}");
        }
    }

    #[tokio::test]
    async fn owner_only_routes_reject_customer_tokens_before_database() {
        let customer = hs256_token("550e8400-e29b-41d4-a716-446655440000", "customer");
        let business_id = "660e8400-e29b-41d4-a716-446655440000";
        let cases = [
            (
                Method::POST,
                "/api/businesses",
                json!({
                    "name": "Test Shop",
                    "address": "1 Main St",
                    "category": "restaurant"
                }),
            ),
            (
                Method::POST,
                "/api/subscriptions",
                json!({
                    "business_id": business_id,
                    "tier": "free",
                    "billing_cycle": "monthly"
                }),
            ),
            (
                Method::POST,
                "/api/claims",
                json!({
                    "business_id": business_id,
                    "owner_name": "Test Owner"
                }),
            ),
        ];

        for (method, uri, body) in cases {
            let response = send(method, uri, body, Some(&customer)).await;
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{uri}");
        }
    }

    #[tokio::test]
    async fn invalid_route_contracts_return_bad_request_before_database() {
        let customer = hs256_token("550e8400-e29b-41d4-a716-446655440000", "customer");
        let business_id = "660e8400-e29b-41d4-a716-446655440000";
        let cases = [
            (Method::POST, "/api/checkins", json!({})),
            (
                Method::POST,
                "/api/reviews",
                json!({ "business_id": business_id, "rating": 6 }),
            ),
            (Method::POST, "/api/saved/not-a-uuid", Value::Null),
            (Method::POST, "/api/feed/posts", json!({ "content": "   " })),
            (Method::POST, "/api/feed/not-a-uuid/like", Value::Null),
        ];

        for (method, uri, body) in cases {
            let response = send(method, uri, body, Some(&customer)).await;
            assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{uri}");
        }
    }

    #[tokio::test]
    async fn deployment_smoke_routes_fail_safely_without_external_services() {
        let health = send(Method::GET, "/api/health", Value::Null, None).await;
        assert_eq!(health.status(), StatusCode::OK);

        let discover = send(
            Method::GET,
            "/api/discover?lat=999&lng=0",
            Value::Null,
            None,
        )
        .await;
        assert_eq!(discover.status(), StatusCode::BAD_REQUEST);

        let stripe_webhook = send(
            Method::POST,
            "/api/stripe/webhook",
            json!({ "id": "evt_test" }),
            None,
        )
        .await;
        assert_eq!(stripe_webhook.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn vercel_rewrites_cover_api_and_spa_fallback() {
        let config: Value =
            serde_json::from_str(include_str!("../../vercel.json")).expect("valid vercel.json");
        let rewrites = config["rewrites"].as_array().expect("rewrites array");

        assert!(rewrites.iter().any(|rewrite| {
            rewrite["source"] == "/api/:path*" && rewrite["destination"] == "/api/index"
        }));
        assert!(rewrites.iter().any(|rewrite| {
            rewrite["source"] == "/:path*" && rewrite["destination"] == "/index.html"
        }));
    }

    async fn send(
        method: Method,
        uri: &str,
        body: Value,
        bearer_token: Option<&str>,
    ) -> axum::response::Response {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = bearer_token {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {}", token));
        }
        let request = if body.is_null() {
            builder.body(Body::empty()).unwrap()
        } else {
            builder
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .unwrap()
        };

        build_router(test_state()).oneshot(request).await.unwrap()
    }

    fn hs256_token(user_id: &str, role: &str) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(
            json!({
                "sub": user_id,
                "email": "test@example.com",
                "exp": chrono::Utc::now().timestamp() + 300,
                "iat": chrono::Utc::now().timestamp(),
                "app_metadata": { "role": role },
                "user_metadata": { "full_name": "Test User" }
            })
            .to_string()
            .as_bytes(),
        );
        let signing_input = format!("{}.{}", header, payload);
        let mut mac = HmacSha256::new_from_slice(test_config().supabase_jwt_secret.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(signing_input.as_bytes());
        let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        format!("{}.{}", signing_input, signature)
    }
}

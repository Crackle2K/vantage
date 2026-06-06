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
    let state = Arc::new(AppState {
        config: config.clone(),
        db,
        rate_limiter: security::RateLimiter::new(),
    });

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
        .nest("/api", routes::campaigns::router())
        .nest("/api", routes::conversion_analytics::router())
        .nest("/api", routes::reviews::router())
        .nest("/api", routes::customer_events::router())
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
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

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
            supabase_url: "https://example.supabase.co".into(),
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
        Arc::new(AppState {
            db: Database {
                supabase: db::SupabaseClient::new(&config),
            },
            config,
            rate_limiter: security::RateLimiter::new(),
        })
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
    async fn customer_event_requires_authenticated_or_anonymous_identity_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/customer-events")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "event_type": "match_card_impression",
                            "business_id": "550e8400-e29b-41d4-a716-446655440000",
                            "source_surface": "decide"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn invalid_customer_event_type_returns_bad_request_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/customer-events")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "event_type": "sponsored_rank_boost",
                            "business_id": "550e8400-e29b-41d4-a716-446655440000",
                            "source_surface": "decide",
                            "anonymous_session_id": "anon_test_session"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn conversion_summary_requires_authentication_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/api/businesses/550e8400-e29b-41d4-a716-446655440000/conversion-summary")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn invalid_conversion_range_returns_bad_request_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/api/businesses/550e8400-e29b-41d4-a716-446655440000/conversion-summary?range=365d")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn invalid_campaign_business_id_returns_bad_request_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/api/businesses/not-a-uuid/campaigns")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn campaign_claim_requires_authentication_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/campaigns/550e8400-e29b-41d4-a716-446655440000/claim")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn invalid_offer_claim_deal_id_returns_bad_request_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/deals/not-a-uuid/claim")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn offer_claim_requires_authentication_before_database() {
        let response = build_router(test_state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/deals/550e8400-e29b-41d4-a716-446655440000/claim")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}

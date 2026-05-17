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
        .route("/health", get(health_check))
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
    let db_ok = state
        .db
        .mongo
        .raw_db()
        .list_collection_names()
        .await
        .is_ok();

    let status = if db_ok { "ok" } else { "degraded" };

    axum::Json(serde_json::json!({
        "status": status,
        "version": "1.0.0",
        "checks": {
            "database": if db_ok { "ok" } else { "error" }
        }
    }))
}

#![allow(dead_code)]

mod config;
mod db;
mod errors;
mod jwt;
mod middleware;
mod models;
mod routes;
mod security;
mod services;
mod state;

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
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    // Load .env
    dotenvy::dotenv().ok();
    if std::path::Path::new("backend/.env").exists() {
        dotenvy::from_filename("backend/.env").ok();
    } else if std::path::Path::new(".env").exists() {
        dotenvy::dotenv().ok();
    }

    // Tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    tracing::info!(
        environment = %config.environment,
        demo_mode = config.demo_mode,
        "Vantage backend starting"
    );

    let db = Database::new(&config).await;
    let state = Arc::new(AppState {
        config: config.clone(),
        db,
        rate_limiter: security::RateLimiter::new(),
    });

    // CORS
    let origins: Vec<axum::http::HeaderValue> = config
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

    let app = Router::new()
        // Health / root
        .route("/", get(root))
        .route("/health", get(health_check))
        // Auth (no auth middleware required)
        .nest("/api/auth", routes::auth::router())
        // Protected routes — auth injected via optional_auth so handlers can decide
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
        .with_state(state.clone());

    let port = std::env::var("PORT").unwrap_or_else(|_| "8000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind TCP listener");

    tracing::info!("Listening on {}", addr);
    axum::serve(listener, app).await.expect("Server error");
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

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database unavailable: {0}")]
    DatabaseUnavailable(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Rate limit exceeded")]
    RateLimited,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_code, message) = match &self {
            AppError::DatabaseUnavailable(msg) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "database_unavailable",
                msg.as_str(),
            ),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "not_found", msg.as_str()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "unauthorized", msg.as_str()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "forbidden", msg.as_str()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "bad_request", msg.as_str()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "conflict", msg.as_str()),
            AppError::Internal(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                msg.as_str(),
            ),
            AppError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limit_exceeded",
                "Too many requests. Please try again later.",
            ),
        };

        let body = Json(json!({ "detail": message, "error": error_code }));
        (status, body).into_response()
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(e: mongodb::error::Error) -> Self {
        AppError::DatabaseUnavailable(e.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

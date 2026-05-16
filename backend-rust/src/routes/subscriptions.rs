use crate::{errors::{AppError, Result}, middleware::auth::AuthUser, models::subscription::all_tier_infos, state::AppState};
use axum::{
    extract::{Extension, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{doc, Document};
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/subscriptions/tiers", get(get_tiers))
        .route("/subscriptions/mine", get(my_subscription))
        .route("/subscriptions", post(create_subscription))
        .route("/subscriptions/cancel", post(cancel_subscription))
}

async fn get_tiers() -> impl IntoResponse {
    Json(json!({ "tiers": all_tier_infos() }))
}

async fn my_subscription(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("subscriptions");
    let sub = col.find_one(doc! { "user_id": &auth_user.id }).await?;

    match sub {
        Some(doc) => Ok(Json(serde_json::to_value(&doc).unwrap_or(Value::Null))),
        None => Ok(Json(json!({ "tier": "FREE", "status": "active" }))),
    }
}

async fn create_subscription(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let tier = payload["tier"].as_str().unwrap_or("FREE");
    let price_id = payload["price_id"].as_str().unwrap_or("");

    if tier == "FREE" {
        return Ok(Json(json!({ "tier": "FREE", "status": "active" })));
    }

    if state.config.stripe_secret_key.is_empty() {
        return Err(AppError::BadRequest("Stripe not configured".into()));
    }

    // Create/retrieve Stripe customer and subscription via Stripe API
    let stripe_result = crate::services::stripe::create_subscription(
        &state.config.stripe_secret_key,
        &auth_user.email,
        price_id,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Stripe error: {}", e)))?;

    let col: mongodb::Collection<Document> = state.db.mongo.collection("subscriptions");
    let now = chrono::Utc::now();
    let sub_doc = doc! {
        "user_id": &auth_user.id,
        "tier": tier,
        "stripe_customer_id": stripe_result["customer"].as_str().unwrap_or(""),
        "stripe_subscription_id": stripe_result["id"].as_str().unwrap_or(""),
        "stripe_price_id": price_id,
        "status": "active",
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
    };

    col.insert_one(sub_doc).await?;

    // Update user subscription tier
    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    users
        .update_one(
            doc! { "_id": &auth_user.id },
            doc! { "$set": { "subscription_tier": tier } },
        )
        .await
        .ok();

    Ok(Json(json!({ "tier": tier, "status": "active" })))
}

async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("subscriptions");
    let sub = col
        .find_one(doc! { "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("No active subscription".into()))?;

    let sub_id = sub.get_str("stripe_subscription_id").unwrap_or("").to_string();

    if !sub_id.is_empty() && !state.config.stripe_secret_key.is_empty() {
        crate::services::stripe::cancel_subscription(&state.config.stripe_secret_key, &sub_id)
            .await
            .ok();
    }

    col.update_one(
        doc! { "user_id": &auth_user.id },
        doc! { "$set": { "status": "canceled", "tier": "FREE" } },
    )
    .await?;

    let users: mongodb::Collection<Document> = state.db.mongo.collection("users");
    users
        .update_one(
            doc! { "_id": &auth_user.id },
            doc! { "$set": { "subscription_tier": "FREE" } },
        )
        .await
        .ok();

    Ok(Json(json!({ "message": "Subscription cancelled" })))
}

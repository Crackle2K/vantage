use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{eq, normalize_id_alias, order, select_all, value_str},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use serde_json::{json, Value};
use std::{env, sync::Arc};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/subscriptions/tiers", get(get_tiers))
        .route("/subscriptions/mine", get(my_subscriptions))
        .route("/subscriptions/my", get(my_subscriptions))
        .route(
            "/subscriptions/business/:business_id",
            get(business_subscription),
        )
        .route("/subscriptions", post(create_subscription))
        .route("/subscriptions/cancel", post(cancel_subscription))
}

async fn get_tiers() -> impl IntoResponse {
    Json(json!([
        {
            "tier": "free",
            "name": "Free",
            "description": "Core listing tools for getting started.",
            "monthly_price": 0,
            "yearly_price": 0,
            "features": ["Claim one listing", "Basic profile", "Community reviews"],
            "highlighted": false
        },
        {
            "tier": "starter",
            "name": "Basic",
            "description": "More ways to keep a local listing current.",
            "monthly_price": 9.99,
            "yearly_price": 95.90,
            "features": ["More active deals", "Owner events", "Profile highlights"],
            "highlighted": false
        },
        {
            "tier": "pro",
            "name": "Standard",
            "description": "Analytics and publishing tools for growing teams.",
            "monthly_price": 29.99,
            "yearly_price": 287.90,
            "features": ["Analytics", "Priority event placement", "Expanded media"],
            "highlighted": true
        },
        {
            "tier": "premium",
            "name": "Premium",
            "description": "Advanced presence tools for multi-location operators.",
            "monthly_price": 79.99,
            "yearly_price": 767.90,
            "features": ["Unlimited active deals", "Advanced analytics", "Priority support"],
            "highlighted": false
        }
    ]))
}

async fn my_subscriptions(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let rows = state
        .db
        .supabase
        .select_json(
            "subscriptions",
            &[
                select_all(),
                eq("user_id", &auth_user.id),
                order("created_at.desc"),
            ],
        )
        .await?
        .into_iter()
        .map(normalize_id_alias)
        .collect::<Vec<_>>();

    Ok(Json(rows))
}

async fn business_subscription(
    State(state): State<Arc<AppState>>,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let row = state
        .db
        .supabase
        .select_one_json(
            "subscriptions",
            &[
                select_all(),
                eq("business_id", &business_id),
                eq("status", "active"),
                order("created_at.desc"),
            ],
        )
        .await?;

    Ok(Json(row.map(normalize_id_alias).unwrap_or(Value::Null)))
}

async fn create_subscription(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    let tier = payload["tier"]
        .as_str()
        .unwrap_or("free")
        .to_ascii_lowercase();
    let billing_cycle = payload["billing_cycle"]
        .as_str()
        .unwrap_or("monthly")
        .to_ascii_lowercase();
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;

    if !matches!(tier.as_str(), "free" | "starter" | "pro" | "premium") {
        return Err(AppError::BadRequest("Invalid subscription tier".into()));
    }
    if !matches!(billing_cycle.as_str(), "monthly" | "yearly") {
        return Err(AppError::BadRequest("Invalid billing cycle".into()));
    }

    let business = state
        .db
        .supabase
        .select_one_json("businesses", &[select_all(), eq("id", business_id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    if value_str(&business, "owner_id") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    let now = Utc::now();
    let mut stripe_customer_id = Value::Null;
    let mut stripe_subscription_id = Value::Null;
    let mut stripe_price_id = Value::Null;
    let mut status = "active".to_string();

    if tier != "free" {
        if state.config.stripe_secret_key.is_empty() {
            return Err(AppError::BadRequest("Stripe not configured".into()));
        }
        let price_id = price_id_for(&tier, &billing_cycle, payload["price_id"].as_str())?;
        let stripe_result = crate::services::stripe::create_subscription(
            &state.config.stripe_secret_key,
            &auth_user.email,
            &price_id,
        )
        .await
        .map_err(|e| AppError::Internal(format!("Stripe error: {}", e)))?;

        stripe_customer_id = json!(stripe_result["customer"].as_str().unwrap_or(""));
        stripe_subscription_id = json!(stripe_result["id"].as_str().unwrap_or(""));
        stripe_price_id = json!(price_id);
        status = stripe_result["status"]
            .as_str()
            .unwrap_or("active")
            .to_string();
    }

    let period_end = match billing_cycle.as_str() {
        "yearly" => now + Duration::days(365),
        _ => now + Duration::days(30),
    };

    state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[
                eq("user_id", &auth_user.id),
                eq("business_id", business_id),
                eq("status", "active"),
            ],
            json!({ "status": "canceled", "updated_at": now.to_rfc3339() }),
        )
        .await
        .ok();

    let created = state
        .db
        .supabase
        .insert_json(
            "subscriptions",
            json!({
                "user_id": auth_user.id,
                "business_id": business_id,
                "tier": tier,
                "billing_cycle": billing_cycle,
                "status": status,
                "current_period_start": now.to_rfc3339(),
                "current_period_end": period_end.to_rfc3339(),
                "cancel_at_period_end": false,
                "stripe_customer_id": stripe_customer_id,
                "stripe_subscription_id": stripe_subscription_id,
                "stripe_price_id": stripe_price_id,
                "billing_provider": if tier == "free" { "manual" } else { "stripe" },
                "created_at": now.to_rfc3339(),
                "updated_at": now.to_rfc3339(),
            }),
        )
        .await?;

    update_auth_subscription_tier(&state, &auth_user.id, &tier)
        .await
        .ok();

    Ok(Json(normalize_id_alias(created)))
}

async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let sub = state
        .db
        .supabase
        .select_one_json(
            "subscriptions",
            &[
                select_all(),
                eq("user_id", &auth_user.id),
                eq("status", "active"),
                order("created_at.desc"),
            ],
        )
        .await?
        .ok_or_else(|| AppError::NotFound("No active subscription".into()))?;

    let sub_id = value_str(&sub, "stripe_subscription_id").to_string();
    if !sub_id.is_empty() && !state.config.stripe_secret_key.is_empty() {
        crate::services::stripe::cancel_subscription(&state.config.stripe_secret_key, &sub_id)
            .await
            .ok();
    }

    state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[eq("id", value_str(&sub, "id"))],
            json!({
                "status": "canceled",
                "tier": "free",
                "cancel_at_period_end": true,
                "updated_at": Utc::now().to_rfc3339(),
            }),
        )
        .await?;

    update_auth_subscription_tier(&state, &auth_user.id, "free")
        .await
        .ok();

    Ok(Json(json!({ "message": "Subscription cancelled" })))
}

fn price_id_for(tier: &str, billing_cycle: &str, explicit: Option<&str>) -> Result<String> {
    if let Some(value) = explicit.filter(|value| !value.trim().is_empty()) {
        return Ok(value.to_string());
    }

    let key = format!(
        "STRIPE_PRICE_{}_{}",
        tier.to_ascii_uppercase(),
        billing_cycle.to_ascii_uppercase()
    );
    env::var(&key).map_err(|_| AppError::BadRequest(format!("{} is not configured", key)))
}

async fn update_auth_subscription_tier(state: &AppState, user_id: &str, tier: &str) -> Result<()> {
    let current = state.db.supabase.auth_get_user(user_id).await?;
    let mut app_metadata = current.app_metadata.clone();
    if !app_metadata.is_object() {
        app_metadata = json!({});
    }
    if let Some(object) = app_metadata.as_object_mut() {
        object.insert("subscription_tier".into(), json!(tier.to_ascii_uppercase()));
    }
    state
        .db
        .supabase
        .auth_update_user(user_id, json!({ "app_metadata": app_metadata }))
        .await?;
    Ok(())
}

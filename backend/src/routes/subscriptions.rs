use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{eq, normalize_id_alias, order, q, select_all, value_str},
    security,
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::HeaderMap,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use std::{env, sync::Arc};

type HmacSha256 = Hmac<Sha256>;
const STRIPE_WEBHOOK_TOLERANCE_SECS: i64 = 300;

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
        .route("/subscriptions/webhook/stripe", post(stripe_webhook))
        .route("/stripe/webhook", post(stripe_webhook))
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
            "features": ["Analytics", "Expanded owner events", "Expanded media"],
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
    auth_user: AuthUser,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    ensure_business_owner_role(&auth_user)?;
    let business = state
        .db
        .supabase
        .select_one_json("businesses", &[select_all(), eq("id", &business_id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    if auth_user.role != "admin" && value_str(&business, "owner_id") != auth_user.id {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

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
    let business_id = security::validate_uuid_id(business_id, "business ID")?;

    if !matches!(tier.as_str(), "free" | "starter" | "pro" | "premium") {
        return Err(AppError::BadRequest("Invalid subscription tier".into()));
    }
    if !matches!(billing_cycle.as_str(), "monthly" | "yearly") {
        return Err(AppError::BadRequest("Invalid billing cycle".into()));
    }
    ensure_business_owner_role(&auth_user)?;

    let business = state
        .db
        .supabase
        .select_one_json("businesses", &[select_all(), eq("id", &business_id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    if auth_user.role != "admin" && value_str(&business, "owner_id") != auth_user.id {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    let now = Utc::now();
    if tier != "free" {
        if state.config.stripe_secret_key.is_empty() {
            return Err(AppError::BadRequest("Stripe not configured".into()));
        }
        if auth_user.email.trim().is_empty() {
            return Err(AppError::BadRequest(
                "Account email required for billing".into(),
            ));
        }
        let price_id = price_id_for(&tier, &billing_cycle)?;
        let success_url = checkout_return_url(&state, "success");
        let cancel_url = checkout_return_url(&state, "cancel");
        let checkout = crate::services::stripe::create_checkout_session(
            &state.stripe_http,
            crate::services::stripe::CheckoutSessionRequest {
                secret_key: &state.config.stripe_secret_key,
                email: &auth_user.email,
                price_id: &price_id,
                success_url: &success_url,
                cancel_url: &cancel_url,
                user_id: &auth_user.id,
                business_id: &business_id,
                tier: &tier,
                billing_cycle: &billing_cycle,
            },
        )
        .await
        .map_err(|_| AppError::ServiceUnavailable("Stripe checkout is unavailable".into()))?;

        let checkout_url = checkout["url"]
            .as_str()
            .ok_or_else(|| AppError::Internal("Stripe checkout URL missing".into()))?;
        let checkout_session_id = checkout["id"].as_str().unwrap_or_default();

        let period_end = match billing_cycle.as_str() {
            "yearly" => now + Duration::days(365),
            _ => now + Duration::days(30),
        };
        let pending = state
            .db
            .supabase
            .insert_json(
                "subscriptions",
                json!({
                    "user_id": auth_user.id,
                    "business_id": business_id,
                    "tier": tier,
                    "billing_cycle": billing_cycle,
                    "status": "pending_checkout",
                    "current_period_start": now.to_rfc3339(),
                    "current_period_end": period_end.to_rfc3339(),
                    "cancel_at_period_end": false,
                    "stripe_checkout_session_id": checkout_session_id,
                    "stripe_price_id": price_id,
                    "billing_provider": "stripe_checkout",
                    "created_at": now.to_rfc3339(),
                    "updated_at": now.to_rfc3339(),
                }),
            )
            .await?;

        return Ok(Json(json!({
            "checkout_url": checkout_url,
            "checkout_session_id": checkout_session_id,
            "status": "pending_checkout",
            "subscription": normalize_id_alias(pending),
        })));
    }

    let period_end = match billing_cycle.as_str() {
        "yearly" => now + Duration::days(365),
        _ => now + Duration::days(30),
    };

    let active_for_business = state
        .db
        .supabase
        .select_json(
            "subscriptions",
            &[
                select_all(),
                eq("user_id", &auth_user.id),
                eq("business_id", &business_id),
                eq("status", "active"),
            ],
        )
        .await?;
    for subscription in &active_for_business {
        cancel_stripe_subscription_if_needed(&state, subscription).await?;
    }

    state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[
                eq("user_id", &auth_user.id),
                eq("business_id", &business_id),
                eq("status", "active"),
            ],
            json!({ "status": "canceled", "updated_at": now.to_rfc3339() }),
        )
        .await
        .map_err(AppError::from)?;

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
                "status": "active",
                "current_period_start": now.to_rfc3339(),
                "current_period_end": period_end.to_rfc3339(),
                "cancel_at_period_end": false,
                "billing_provider": if tier == "free" { "manual" } else { "stripe" },
                "created_at": now.to_rfc3339(),
                "updated_at": now.to_rfc3339(),
            }),
        )
        .await?;

    refresh_auth_subscription_tier_from_active_subscriptions(&state, &auth_user.id).await?;

    Ok(Json(normalize_id_alias(created)))
}

async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    payload: Option<Json<Value>>,
) -> Result<impl IntoResponse> {
    let business_id = payload
        .as_ref()
        .and_then(|Json(value)| value["business_id"].as_str())
        .map(|value| security::validate_uuid_id(value, "business ID"))
        .transpose()?;

    let mut query = vec![
        select_all(),
        eq("user_id", &auth_user.id),
        eq("status", "active"),
        order("created_at.desc"),
    ];
    if let Some(business_id) = business_id.as_ref() {
        query.push(eq("business_id", business_id));
    }

    let subscriptions = state
        .db
        .supabase
        .select_json("subscriptions", &query)
        .await?;
    let sub = match subscriptions.as_slice() {
        [] => return Err(AppError::NotFound("No active subscription".into())),
        [subscription] => subscription.clone(),
        _ => {
            return Err(AppError::BadRequest(
                "business_id required when multiple active subscriptions exist".into(),
            ));
        }
    };

    cancel_stripe_subscription_if_needed(&state, &sub).await?;

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

    refresh_auth_subscription_tier_from_active_subscriptions(&state, &auth_user.id).await?;

    Ok(Json(json!({ "message": "Subscription cancelled" })))
}

async fn stripe_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse> {
    let signature = headers
        .get("stripe-signature")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("Missing Stripe signature".into()))?;

    verify_stripe_signature(
        &state.config.stripe_webhook_secret,
        signature,
        &body,
        Utc::now().timestamp(),
    )?;

    let event: Value = serde_json::from_slice(&body)
        .map_err(|_| AppError::BadRequest("Invalid Stripe webhook payload".into()))?;
    let event_type = event["type"].as_str().unwrap_or_default();
    let object = &event["data"]["object"];

    let result = match event_type {
        "checkout.session.completed" | "checkout.session.async_payment_succeeded" => {
            activate_checkout_subscription(&state, object, event_type).await?
        }
        "customer.subscription.deleted" => {
            cancel_stripe_subscription_from_webhook(&state, object).await?
        }
        "invoice.payment_failed"
        | "customer.subscription.past_due"
        | "customer.subscription.unpaid" => {
            mark_stripe_subscription_payment_problem(&state, object, event_type).await?
        }
        "customer.subscription.updated"
            if matches!(
                object["status"].as_str(),
                Some("past_due" | "unpaid" | "incomplete_expired")
            ) =>
        {
            mark_stripe_subscription_payment_problem(&state, object, event_type).await?
        }
        _ => json!({ "status": "ignored", "event_type": event_type }),
    };

    Ok(Json(result))
}

async fn activate_checkout_subscription(
    state: &AppState,
    session: &Value,
    event_type: &str,
) -> Result<Value> {
    let session_id = stripe_ref_id(&session["id"])
        .ok_or_else(|| AppError::BadRequest("Stripe checkout session id missing".into()))?;

    if !checkout_session_payment_confirmed(event_type, session) {
        return Ok(json!({
            "status": "ignored",
            "reason": "checkout_payment_not_confirmed",
            "checkout_session_id": session_id,
        }));
    }

    let Some(subscription) = state
        .db
        .supabase
        .select_one_json(
            "subscriptions",
            &[
                select_all(),
                eq("stripe_checkout_session_id", &session_id),
                order("created_at.desc"),
            ],
        )
        .await?
    else {
        return Ok(json!({
            "status": "ignored",
            "reason": "subscription_not_found",
            "checkout_session_id": session_id,
        }));
    };

    let user_id = security::validate_uuid_id(value_str(&subscription, "user_id"), "user ID")?;
    let business_id =
        security::validate_uuid_id(value_str(&subscription, "business_id"), "business ID")?;
    let tier = subscription_or_metadata_value(&subscription, session, "tier");
    if !matches!(tier.as_str(), "starter" | "pro" | "premium") {
        return Err(AppError::BadRequest(
            "Invalid paid subscription tier".into(),
        ));
    }

    if value_str(&subscription, "status") == "active" {
        refresh_auth_subscription_tier_from_active_subscriptions(state, &user_id).await?;
        return Ok(json!({
            "status": "already_active",
            "subscription": normalize_id_alias(subscription),
        }));
    }

    if value_str(&subscription, "status") != "pending_checkout" {
        return Ok(json!({
            "status": "ignored",
            "reason": "subscription_not_pending_checkout",
            "checkout_session_id": session_id,
        }));
    }

    let now = Utc::now().to_rfc3339();
    let subscription_id = value_str(&subscription, "id").to_string();
    let updated = state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[eq("id", &subscription_id), eq("status", "pending_checkout")],
            json!({
                "status": "active",
                "tier": tier,
                "billing_provider": "stripe",
                "stripe_customer_id": stripe_ref_id(&session["customer"]),
                "stripe_subscription_id": stripe_ref_id(&session["subscription"]),
                "updated_at": Utc::now().to_rfc3339(),
            }),
        )
        .await?;

    let Some(activated) = updated.into_iter().next() else {
        let current = state
            .db
            .supabase
            .select_one_json("subscriptions", &[select_all(), eq("id", &subscription_id)])
            .await?;
        if let Some(current) = current {
            refresh_auth_subscription_tier_from_active_subscriptions(state, &user_id).await?;
            return Ok(json!({
                "status": if value_str(&current, "status") == "active" { "already_active" } else { "ignored" },
                "subscription": normalize_id_alias(current),
            }));
        }
        return Err(AppError::Internal(
            "Subscription activation updated no rows".into(),
        ));
    };

    let active_for_business = state
        .db
        .supabase
        .select_json(
            "subscriptions",
            &[
                select_all(),
                eq("user_id", &user_id),
                eq("business_id", &business_id),
                eq("status", "active"),
                q("id", format!("neq.{}", subscription_id)),
            ],
        )
        .await?;
    for active_subscription in &active_for_business {
        cancel_stripe_subscription_if_needed(state, active_subscription).await?;
    }

    state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[
                eq("user_id", &user_id),
                eq("business_id", &business_id),
                eq("status", "active"),
                q("id", format!("neq.{}", subscription_id)),
            ],
            json!({ "status": "canceled", "updated_at": now }),
        )
        .await?;

    refresh_auth_subscription_tier_from_active_subscriptions(state, &user_id).await?;

    Ok(json!({
        "status": "activated",
        "subscription": normalize_id_alias(activated),
    }))
}

async fn cancel_stripe_subscription_from_webhook(
    state: &AppState,
    stripe_subscription: &Value,
) -> Result<Value> {
    let stripe_subscription_id = stripe_ref_id(&stripe_subscription["id"])
        .ok_or_else(|| AppError::BadRequest("Stripe subscription id missing".into()))?;

    let Some(subscription) = state
        .db
        .supabase
        .select_one_json(
            "subscriptions",
            &[
                select_all(),
                eq("stripe_subscription_id", &stripe_subscription_id),
                order("created_at.desc"),
            ],
        )
        .await?
    else {
        return Ok(json!({
            "status": "ignored",
            "reason": "subscription_not_found",
            "stripe_subscription_id": stripe_subscription_id,
        }));
    };

    let user_id = security::validate_uuid_id(value_str(&subscription, "user_id"), "user ID")?;

    if value_str(&subscription, "status") == "canceled" {
        refresh_auth_subscription_tier_from_active_subscriptions(state, &user_id).await?;
        return Ok(json!({
            "status": "already_canceled",
            "subscription": normalize_id_alias(subscription),
        }));
    }

    let updated = state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[eq("id", value_str(&subscription, "id"))],
            json!({
                "status": "canceled",
                "tier": "free",
                "cancel_at_period_end": true,
                "updated_at": Utc::now().to_rfc3339(),
            }),
        )
        .await?;

    let canceled = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal("Subscription cancellation updated no rows".into()))?;

    refresh_auth_subscription_tier_from_active_subscriptions(state, &user_id).await?;

    Ok(json!({
        "status": "canceled",
        "subscription": normalize_id_alias(canceled),
    }))
}

async fn mark_stripe_subscription_payment_problem(
    state: &AppState,
    stripe_object: &Value,
    event_type: &str,
) -> Result<Value> {
    let stripe_subscription_id = stripe_ref_id(&stripe_object["subscription"])
        .or_else(|| stripe_ref_id(&stripe_object["id"]))
        .ok_or_else(|| AppError::BadRequest("Stripe subscription id missing".into()))?;
    let status = stripe_object["status"]
        .as_str()
        .filter(|value| matches!(*value, "past_due" | "unpaid" | "incomplete_expired"))
        .unwrap_or("past_due");

    let Some(subscription) = state
        .db
        .supabase
        .select_one_json(
            "subscriptions",
            &[
                select_all(),
                eq("stripe_subscription_id", &stripe_subscription_id),
                order("created_at.desc"),
            ],
        )
        .await?
    else {
        return Ok(json!({
            "status": "ignored",
            "reason": "subscription_not_found",
            "stripe_subscription_id": stripe_subscription_id,
            "event_type": event_type,
        }));
    };

    let user_id = security::validate_uuid_id(value_str(&subscription, "user_id"), "user ID")?;
    let updated = state
        .db
        .supabase
        .update_json(
            "subscriptions",
            &[eq("id", value_str(&subscription, "id"))],
            json!({
                "status": status,
                "tier": "free",
                "cancel_at_period_end": true,
                "updated_at": Utc::now().to_rfc3339(),
            }),
        )
        .await?;

    let subscription = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal("Subscription payment status updated no rows".into()))?;

    refresh_auth_subscription_tier_from_active_subscriptions(state, &user_id).await?;

    Ok(json!({
        "status": "payment_problem_marked",
        "event_type": event_type,
        "subscription": normalize_id_alias(subscription),
    }))
}

fn price_id_for(tier: &str, billing_cycle: &str) -> Result<String> {
    let key = format!(
        "STRIPE_PRICE_{}_{}",
        tier.to_ascii_uppercase(),
        billing_cycle.to_ascii_uppercase()
    );
    env::var(&key).map_err(|_| AppError::BadRequest("Pricing not available for this tier".into()))
}

fn checkout_return_url(state: &AppState, result: &str) -> String {
    let base = if state.config.is_production() && !state.config.production_url.trim().is_empty() {
        state.config.production_url.trim()
    } else {
        state.config.frontend_url.trim()
    }
    .trim_end_matches('/');

    format!("{}/pricing?checkout={}", base, result)
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

async fn refresh_auth_subscription_tier_from_active_subscriptions(
    state: &AppState,
    user_id: &str,
) -> Result<()> {
    let rows = state
        .db
        .supabase
        .select_json(
            "subscriptions",
            &[select_all(), eq("user_id", user_id), eq("status", "active")],
        )
        .await?;
    let tier = highest_subscription_tier(&rows);
    update_auth_subscription_tier(state, user_id, tier).await
}

async fn cancel_stripe_subscription_if_needed(
    state: &AppState,
    subscription: &Value,
) -> Result<()> {
    let sub_id = value_str(subscription, "stripe_subscription_id");
    if sub_id.is_empty() {
        return Ok(());
    }
    if state.config.stripe_secret_key.is_empty() {
        return Err(AppError::ServiceUnavailable(
            "Stripe is not configured".into(),
        ));
    }
    crate::services::stripe::cancel_subscription(
        &state.stripe_http,
        &state.config.stripe_secret_key,
        sub_id,
    )
    .await
    .map_err(|_| AppError::ServiceUnavailable("Stripe subscription cancellation failed".into()))?;
    Ok(())
}

fn highest_subscription_tier(rows: &[Value]) -> &'static str {
    rows.iter()
        .filter_map(|row| row.get("tier").and_then(Value::as_str))
        .filter_map(normalize_subscription_tier)
        .max_by_key(|tier| subscription_tier_rank(tier))
        .unwrap_or("free")
}

fn normalize_subscription_tier(tier: &str) -> Option<&'static str> {
    match tier.to_ascii_lowercase().as_str() {
        "premium" => Some("premium"),
        "pro" => Some("pro"),
        "starter" => Some("starter"),
        "free" => Some("free"),
        _ => None,
    }
}

fn subscription_tier_rank(tier: &str) -> u8 {
    match tier.to_ascii_lowercase().as_str() {
        "premium" => 3,
        "pro" => 2,
        "starter" => 1,
        _ => 0,
    }
}

fn ensure_business_owner_role(auth_user: &AuthUser) -> Result<()> {
    if auth_user.role == "business_owner" || auth_user.role == "admin" {
        return Ok(());
    }
    Err(AppError::Forbidden(
        "Business owner account required".into(),
    ))
}

fn verify_stripe_signature(
    secret: &str,
    header: &str,
    payload: &[u8],
    now_timestamp: i64,
) -> Result<()> {
    if secret.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Stripe webhook secret is not configured".into(),
        ));
    }

    let (timestamp, signatures) = parse_stripe_signature_header(header)?;
    if (now_timestamp - timestamp).abs() > STRIPE_WEBHOOK_TOLERANCE_SECS {
        return Err(AppError::BadRequest(
            "Stripe webhook timestamp outside tolerance".into(),
        ));
    }

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::Internal("Invalid Stripe webhook secret".into()))?;
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(payload);

    let matches = signatures
        .iter()
        .filter_map(|signature| decode_hex(signature).ok())
        .any(|signature| mac.clone().verify_slice(&signature).is_ok());

    if matches {
        return Ok(());
    }

    Err(AppError::BadRequest("Invalid Stripe signature".into()))
}

fn parse_stripe_signature_header(header: &str) -> Result<(i64, Vec<String>)> {
    let mut timestamp = None;
    let mut signatures = Vec::new();

    for part in header.split(',') {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        match key.trim() {
            "t" => timestamp = value.trim().parse::<i64>().ok(),
            "v1" => signatures.push(value.trim().to_string()),
            _ => {}
        }
    }

    let timestamp = timestamp
        .ok_or_else(|| AppError::BadRequest("Stripe signature timestamp missing".into()))?;
    if signatures.is_empty() {
        return Err(AppError::BadRequest("Stripe v1 signature missing".into()));
    }

    Ok((timestamp, signatures))
}

fn decode_hex(value: &str) -> std::result::Result<Vec<u8>, ()> {
    if !value.len().is_multiple_of(2) {
        return Err(());
    }

    (0..value.len())
        .step_by(2)
        .map(|idx| u8::from_str_radix(&value[idx..idx + 2], 16).map_err(|_| ()))
        .collect()
}

#[cfg(test)]
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn stripe_ref_id(value: &Value) -> Option<String> {
    value
        .as_str()
        .or_else(|| value.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn subscription_or_metadata_value(subscription: &Value, session: &Value, key: &str) -> String {
    let row_value = value_str(subscription, key);
    if !row_value.trim().is_empty() {
        return row_value.to_string();
    }
    session["metadata"][key]
        .as_str()
        .unwrap_or_default()
        .to_string()
}

fn checkout_session_payment_confirmed(event_type: &str, session: &Value) -> bool {
    if event_type == "checkout.session.async_payment_succeeded" {
        return true;
    }

    let payment_status = session["payment_status"].as_str().unwrap_or_default();
    matches!(payment_status, "paid" | "no_payment_required")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signed_header(secret: &str, timestamp: i64, payload: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(timestamp.to_string().as_bytes());
        mac.update(b".");
        mac.update(payload);
        let signature = to_hex(&mac.finalize().into_bytes());
        format!("t={},v1={}", timestamp, signature)
    }

    #[test]
    fn stripe_signature_verification_accepts_valid_signature() {
        let secret = "whsec_test";
        let timestamp = 1_700_000_000;
        let payload = br#"{"id":"evt_test"}"#;
        let header = signed_header(secret, timestamp, payload);

        assert!(verify_stripe_signature(secret, &header, payload, timestamp + 30).is_ok());
    }

    #[test]
    fn stripe_signature_verification_rejects_tampering_and_old_timestamps() {
        let secret = "whsec_test";
        let timestamp = 1_700_000_000;
        let payload = br#"{"id":"evt_test"}"#;
        let header = signed_header(secret, timestamp, payload);

        assert!(
            verify_stripe_signature(secret, &header, br#"{"id":"evt_bad"}"#, timestamp + 30)
                .is_err()
        );
        assert!(verify_stripe_signature(secret, &header, payload, timestamp + 1_000).is_err());
    }

    #[test]
    fn checkout_session_activation_requires_confirmed_payment() {
        assert!(checkout_session_payment_confirmed(
            "checkout.session.completed",
            &json!({ "payment_status": "paid" })
        ));
        assert!(checkout_session_payment_confirmed(
            "checkout.session.async_payment_succeeded",
            &json!({ "payment_status": "unpaid" })
        ));
        assert!(!checkout_session_payment_confirmed(
            "checkout.session.completed",
            &json!({ "payment_status": "unpaid" })
        ));
    }

    #[test]
    fn highest_subscription_tier_prefers_highest_active_tier() {
        assert_eq!(highest_subscription_tier(&[]), "free");
        assert_eq!(
            highest_subscription_tier(&[
                json!({ "tier": "starter" }),
                json!({ "tier": "premium" }),
                json!({ "tier": "pro" }),
            ]),
            "premium"
        );
        assert_eq!(
            highest_subscription_tier(&[json!({ "tier": "unknown" }), json!({ "tier": "free" })]),
            "free"
        );
        assert_eq!(
            highest_subscription_tier(&[json!({ "tier": "STARTER" }), json!({ "tier": "PRO" }),]),
            "pro"
        );
    }
}

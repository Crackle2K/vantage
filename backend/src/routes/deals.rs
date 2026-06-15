use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{
        eq, is_true, limit, normalize_deal, offset, order, q, select_all, unwrap_rpc_items,
        value_str, QueryParams,
    },
    security,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/deals", get(list_deals).post(create_deal))
        .route(
            "/deals/:id",
            get(get_deal).put(update_deal).delete(delete_deal),
        )
        .route("/businesses/:id/deals", get(list_business_deals))
        .route("/deals/business/:id", get(list_business_deals))
}

#[derive(Deserialize)]
struct PaginationParams {
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_deals(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse> {
    let query: QueryParams = vec![
        select_all(),
        is_true("is_active"),
        order("created_at.desc"),
        limit(params.limit.unwrap_or(50).clamp(1, 100)),
        offset(params.offset.unwrap_or(0).max(0)),
    ];
    let deals = state
        .db
        .supabase
        .select_json("deals", &query)
        .await?
        .into_iter()
        .filter(deal_is_current)
        .map(normalize_deal)
        .collect::<Vec<_>>();
    Ok(Json(deals))
}

async fn list_business_deals(
    State(state): State<Arc<AppState>>,
    Path(business_id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    let query: QueryParams = vec![
        select_all(),
        eq("business_id", business_id),
        is_true("is_active"),
        order("created_at.desc"),
        limit(params.limit.unwrap_or(20).clamp(1, 100)),
        offset(params.offset.unwrap_or(0).max(0)),
    ];
    let deals = state
        .db
        .supabase
        .select_json("deals", &query)
        .await?
        .into_iter()
        .filter(deal_is_current)
        .map(normalize_deal)
        .collect::<Vec<_>>();
    Ok(Json(deals))
}

async fn get_deal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let row = find_deal(&state, &id).await?;
    if !deal_is_current(&row) {
        return Err(AppError::NotFound("Deal not found".into()));
    }
    Ok(Json(normalize_deal(row)))
}

#[derive(Deserialize)]
struct DealCreate {
    business_id: String,
    title: String,
    description: Option<String>,
    discount_percent: Option<f64>,
    discount_type: Option<String>,
    discount_value: Option<f64>,
    code: Option<String>,
    valid_until: Option<String>,
    original_price: Option<f64>,
    deal_price: Option<f64>,
}

async fn create_deal(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<DealCreate>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&payload.business_id, "business ID")?;
    let business = find_business(&state, &business_id).await?;
    ensure_business_owner(&business, &auth_user)?;
    ensure_deal_limit_available(&state, &business_id).await?;

    let now = Utc::now();
    let title = validate_deal_title(&payload.title)?;
    let discount_type = validate_discount_type(payload.discount_type.as_deref())?;
    let discount_value = validate_discount_value(
        discount_type,
        payload.discount_value.or(payload.discount_percent),
    )?;
    let valid_until = match payload.valid_until {
        Some(value) => validate_rfc3339("valid_until", &value)?,
        None => (now + Duration::days(30)).to_rfc3339(),
    };

    let mut body = Map::new();
    body.insert("business_id".into(), json!(&business_id));
    body.insert("title".into(), json!(title));
    body.insert(
        "description".into(),
        json!(
            security::sanitize_optional_text(payload.description.as_deref(), 1000)
                .unwrap_or_default()
        ),
    );
    body.insert("discount_type".into(), json!(discount_type));
    body.insert("discount_value".into(), json!(discount_value));
    body.insert("discount_percent".into(), json!(discount_value));
    body.insert("valid_until".into(), json!(valid_until));
    body.insert("is_active".into(), json!(true));
    body.insert("created_at".into(), json!(now.to_rfc3339()));
    body.insert("updated_at".into(), json!(now.to_rfc3339()));

    insert_optional(&mut body, "code", payload.code.as_deref(), 60);
    if let Some(value) = payload
        .original_price
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        body.insert("original_price".into(), json!(value));
    }
    if let Some(value) = payload
        .deal_price
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        body.insert("deal_price".into(), json!(value));
    }

    let created = state
        .db
        .supabase
        .insert_json("deals", Value::Object(body))
        .await?;
    update_business_deal_status(&state, &business_id).await?;

    Ok((StatusCode::CREATED, Json(normalize_deal(created))))
}

#[derive(Deserialize)]
struct DealUpdate {
    title: Option<String>,
    description: Option<String>,
    discount_percent: Option<f64>,
    discount_type: Option<String>,
    discount_value: Option<f64>,
    code: Option<String>,
    valid_until: Option<String>,
    original_price: Option<f64>,
    deal_price: Option<f64>,
    is_active: Option<bool>,
}

async fn update_deal(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<DealUpdate>,
) -> Result<impl IntoResponse> {
    let existing = find_deal(&state, &id).await?;
    let business = find_business(&state, value_str(&existing, "business_id")).await?;
    ensure_business_owner(&business, &auth_user)?;

    let mut body = Map::new();
    body.insert("updated_at".into(), json!(Utc::now().to_rfc3339()));
    if let Some(title) = payload.title.as_deref() {
        body.insert("title".into(), json!(validate_deal_title(title)?));
    }
    insert_optional(
        &mut body,
        "description",
        payload.description.as_deref(),
        1000,
    );
    let effective_discount_type = payload.discount_type.as_deref().or_else(|| {
        let existing_type = value_str(&existing, "discount_type");
        (!existing_type.is_empty()).then_some(existing_type)
    });
    if payload.discount_type.is_some() {
        body.insert(
            "discount_type".into(),
            json!(validate_discount_type(payload.discount_type.as_deref())?),
        );
    }
    insert_optional(&mut body, "code", payload.code.as_deref(), 60);
    if let Some(valid_until) = payload.valid_until {
        body.insert(
            "valid_until".into(),
            json!(validate_rfc3339("valid_until", &valid_until)?),
        );
    }
    if payload.discount_value.is_some() || payload.discount_percent.is_some() {
        let discount_type = validate_discount_type(effective_discount_type)?;
        let value = validate_discount_value(
            discount_type,
            payload.discount_value.or(payload.discount_percent),
        )?;
        body.insert("discount_value".into(), json!(value));
        body.insert("discount_percent".into(), json!(value));
    }
    if let Some(value) = payload.original_price {
        body.insert(
            "original_price".into(),
            json!(validate_price("original_price", value)?),
        );
    }
    if let Some(value) = payload.deal_price {
        body.insert(
            "deal_price".into(),
            json!(validate_price("deal_price", value)?),
        );
    }
    if let Some(active) = payload.is_active {
        body.insert("is_active".into(), json!(active));
    }

    let updated = state
        .db
        .supabase
        .update_json("deals", &[eq("id", &id)], Value::Object(body))
        .await?;
    let row = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Deal not found".into()))?;
    update_business_deal_status(&state, value_str(&existing, "business_id")).await?;
    Ok(Json(normalize_deal(row)))
}

async fn delete_deal(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let existing = find_deal(&state, &id).await?;
    let business = find_business(&state, value_str(&existing, "business_id")).await?;
    ensure_business_owner(&business, &auth_user)?;

    state
        .db
        .supabase
        .delete_json("deals", &[eq("id", &id)])
        .await?;
    update_business_deal_status(&state, value_str(&existing, "business_id")).await?;
    Ok(Json(json!({ "message": "Deal deleted" })))
}

async fn update_business_deal_status(state: &AppState, business_id: &str) -> Result<()> {
    let business_id = security::validate_uuid_id(business_id, "business ID")?;
    match refresh_business_has_deals(state, &business_id).await {
        Ok(()) => return Ok(()),
        Err(err) if deal_status_rpc_unavailable(&err.to_string()) => {
            tracing::warn!(
                error = %err,
                "Deal status RPC unavailable; falling back to API-side deal status refresh"
            );
        }
        Err(err) => return Err(err.into()),
    }

    update_business_deal_status_fallback(state, &business_id).await
}

async fn refresh_business_has_deals(state: &AppState, business_id: &str) -> anyhow::Result<()> {
    let rows = state
        .db
        .supabase
        .rpc_json(
            "refresh_business_has_deals",
            json!({ "p_business_id": business_id }),
        )
        .await?;
    let updated = unwrap_rpc_items(rows);
    if updated.is_empty() {
        anyhow::bail!("Business not found");
    }
    Ok(())
}

async fn update_business_deal_status_fallback(state: &AppState, business_id: &str) -> Result<()> {
    let rows = state
        .db
        .supabase
        .select_json(
            "deals",
            &[
                q("select", "id"),
                eq("business_id", business_id),
                is_true("is_active"),
                current_deals_filter(Utc::now()),
                limit(1),
            ],
        )
        .await?;
    let has_current_deals = !rows.is_empty();

    state
        .db
        .supabase
        .update_json(
            "businesses",
            &[
                eq("id", business_id),
                q("has_deals", format!("neq.{}", has_current_deals)),
            ],
            json!({ "has_deals": has_current_deals }),
        )
        .await?;

    Ok(())
}

fn current_deals_filter(now: DateTime<Utc>) -> (String, String) {
    q(
        "or",
        format!("(valid_until.is.null,valid_until.gt.{})", now.to_rfc3339()),
    )
}

fn deal_status_rpc_unavailable(message: &str) -> bool {
    let lowered = message.to_ascii_lowercase();
    (lowered.contains("refresh_business_has_deals") && lowered.contains("does not exist"))
        || lowered.contains("could not find the function")
        || lowered.contains("schema cache")
}

async fn find_deal(state: &AppState, id: &str) -> Result<Value> {
    let id = security::validate_uuid_id(id, "deal ID")?;
    state
        .db
        .supabase
        .select_one_json("deals", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Deal not found".into()))
}

async fn find_business(state: &AppState, id: &str) -> Result<Value> {
    let id = security::validate_uuid_id(id, "business ID")?;
    state
        .db
        .supabase
        .select_one_json("businesses", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))
}

fn ensure_business_owner(row: &Value, auth_user: &AuthUser) -> Result<()> {
    if auth_user.role != "business_owner" && auth_user.role != "admin" {
        return Err(AppError::Forbidden(
            "Business owner account required".into(),
        ));
    }
    if auth_user.role == "admin" {
        return Ok(());
    }
    if value_str(row, "owner_id") != auth_user.id {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }
    Ok(())
}

async fn ensure_deal_limit_available(state: &AppState, business_id: &str) -> Result<()> {
    let Some(max_deals) = active_deal_limit_for_business(state, business_id).await? else {
        return Ok(());
    };

    let active_count = state
        .db
        .supabase
        .count(
            "deals",
            &[
                eq("business_id", business_id),
                is_true("is_active"),
                current_deals_filter(Utc::now()),
            ],
        )
        .await?;

    if active_count >= max_deals as usize {
        return Err(AppError::BadRequest(
            "Active deal limit reached for the current plan".into(),
        ));
    }
    Ok(())
}

async fn active_deal_limit_for_business(
    state: &AppState,
    business_id: &str,
) -> Result<Option<u32>> {
    let rows = state
        .db
        .supabase
        .select_json(
            "subscriptions",
            &[
                q("select", "tier"),
                eq("business_id", business_id),
                eq("status", "active"),
            ],
        )
        .await?;
    let tier = rows
        .iter()
        .filter_map(|row| row.get("tier").and_then(Value::as_str))
        .max_by_key(|tier| subscription_tier_rank(tier))
        .unwrap_or("free");

    Ok(max_deals_for_tier(tier))
}

fn max_deals_for_tier(tier: &str) -> Option<u32> {
    match tier.to_ascii_lowercase().as_str() {
        "premium" => None,
        "pro" => Some(20),
        "starter" => Some(5),
        _ => Some(1),
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

fn insert_optional(body: &mut Map<String, Value>, key: &str, value: Option<&str>, max: usize) {
    if let Some(value) = value.and_then(|raw| security::sanitize_optional_text(Some(raw), max)) {
        body.insert(key.into(), json!(value));
    }
}

fn validate_discount_type(value: Option<&str>) -> Result<&'static str> {
    match value
        .unwrap_or("percentage")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "percentage" | "percent" => Ok("percentage"),
        "fixed" | "fixed_amount" | "amount" => Ok("fixed"),
        _ => Err(AppError::BadRequest("Invalid discount type".into())),
    }
}

fn validate_deal_title(value: &str) -> Result<String> {
    let title = security::sanitize_text(value, 200);
    if title.is_empty() {
        return Err(AppError::BadRequest("Deal title required".into()));
    }
    Ok(title)
}

fn validate_discount_value(discount_type: &str, value: Option<f64>) -> Result<f64> {
    let value = value.unwrap_or(0.0);
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::BadRequest("Invalid discount value".into()));
    }
    if discount_type == "percentage" && value > 100.0 {
        return Err(AppError::BadRequest(
            "Percentage discount cannot exceed 100".into(),
        ));
    }
    Ok(value)
}

fn validate_price(label: &str, value: f64) -> Result<f64> {
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::BadRequest(format!("Invalid {}", label)));
    }
    Ok(value)
}

fn deal_is_current(row: &Value) -> bool {
    if row.get("is_active").and_then(Value::as_bool) != Some(true) {
        return false;
    }
    let valid_until = value_str(row, "valid_until");
    if valid_until.is_empty() {
        return true;
    }
    DateTime::parse_from_rfc3339(valid_until)
        .map(|date| date.with_timezone(&Utc) > Utc::now())
        .unwrap_or(false)
}

fn validate_rfc3339(label: &str, value: &str) -> Result<String> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc).to_rfc3339())
        .map_err(|_| AppError::BadRequest(format!("{} must be an ISO-8601 timestamp", label)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deal_is_current_requires_active_unexpired_rows() {
        let future = (Utc::now() + Duration::days(1)).to_rfc3339();
        let past = (Utc::now() - Duration::days(1)).to_rfc3339();

        assert!(deal_is_current(&json!({ "is_active": true })));
        assert!(deal_is_current(&json!({
            "is_active": true,
            "valid_until": future,
        })));
        assert!(!deal_is_current(&json!({
            "is_active": false,
            "valid_until": future,
        })));
        assert!(!deal_is_current(&json!({
            "is_active": true,
            "valid_until": past,
        })));
    }

    #[test]
    fn current_deals_filter_targets_open_or_future_deals() {
        let now = DateTime::parse_from_rfc3339("2026-05-20T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        assert_eq!(
            current_deals_filter(now),
            (
                "or".to_string(),
                "(valid_until.is.null,valid_until.gt.2026-05-20T12:00:00+00:00)".to_string()
            )
        );
    }
}

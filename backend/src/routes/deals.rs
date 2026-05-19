use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{
        eq, is_true, limit, normalize_deal, order, select_all, value_str, QueryParams,
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

    let now = Utc::now();
    let discount_value = payload
        .discount_value
        .or(payload.discount_percent)
        .unwrap_or(0.0)
        .max(0.0);
    let valid_until = match payload.valid_until {
        Some(value) => validate_rfc3339("valid_until", &value)?,
        None => (now + Duration::days(30)).to_rfc3339(),
    };

    let mut body = Map::new();
    body.insert("business_id".into(), json!(&business_id));
    body.insert(
        "title".into(),
        json!(security::sanitize_text(&payload.title, 200)),
    );
    body.insert(
        "description".into(),
        json!(
            security::sanitize_optional_text(payload.description.as_deref(), 1000)
                .unwrap_or_default()
        ),
    );
    body.insert(
        "discount_type".into(),
        json!(validate_discount_type(payload.discount_type.as_deref())?),
    );
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

    state
        .db
        .supabase
        .update_json(
            "businesses",
            &[eq("id", &business_id)],
            json!({ "has_deals": true }),
        )
        .await
        .ok();

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
    insert_optional(&mut body, "title", payload.title.as_deref(), 200);
    insert_optional(
        &mut body,
        "description",
        payload.description.as_deref(),
        1000,
    );
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
    if let Some(value) = payload.discount_value.or(payload.discount_percent) {
        if !value.is_finite() || value < 0.0 {
            return Err(AppError::BadRequest("Invalid discount value".into()));
        }
        body.insert("discount_value".into(), json!(value));
        body.insert("discount_percent".into(), json!(value));
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
    Ok(Json(json!({ "message": "Deal deleted" })))
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
    if value_str(row, "owner_id") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }
    Ok(())
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

use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{
        eq, is_true, limit, normalize_deal, order, q, select_all, unwrap_rpc_items, value_str,
        QueryParams,
    },
    security,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use rand::{distributions::Alphanumeric, Rng};
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
        .route("/deals/:id/claim", post(claim_deal))
        .route(
            "/offer-claims/:id/redeem-placeholder",
            post(redeem_offer_claim_placeholder),
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

#[derive(Deserialize, Default)]
struct OfferClaimPayload {
    source_surface: Option<String>,
    anonymous_session_id: Option<String>,
    intent: Option<String>,
    metadata: Option<Value>,
}

async fn claim_deal(
    State(state): State<Arc<AppState>>,
    auth_user: Option<Extension<AuthUser>>,
    Path(id): Path<String>,
    Json(payload): Json<OfferClaimPayload>,
) -> Result<impl IntoResponse> {
    let deal_id = security::validate_uuid_id(&id, "deal ID")?;
    let Some(Extension(auth_user)) = auth_user else {
        return Err(AppError::Unauthorized(
            "Sign in to claim offers durably".into(),
        ));
    };

    let deal = find_deal(&state, &deal_id).await?;
    if !deal_is_current(&deal) {
        return Err(AppError::BadRequest("Deal is not active".into()));
    }
    let business_id = security::validate_uuid_id(value_str(&deal, "business_id"), "business ID")?;
    let _business = find_business(&state, &business_id).await?;

    let claimed_at = Utc::now();
    let body = build_offer_claim_body(&deal, &business_id, &auth_user, claimed_at)?;
    let claim = state.db.supabase.insert_json("offer_claims", body).await?;
    let claim_id = value_str(&claim, "id").to_string();

    if let Err(err) = insert_offer_action_event(
        &state,
        "offer_claim",
        &business_id,
        Some(&deal_id),
        Some(&claim_id),
        Some(&auth_user),
        &payload,
    )
    .await
    {
        tracing::warn!(error = %err, "Offer claim event tracking failed");
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "offer_claim_id": claim_id,
            "deal_id": deal_id,
            "business_id": business_id,
            "claim_code": value_str(&claim, "claim_code"),
            "status": value_str(&claim, "status"),
            "claimed_at": claim
                .get("claimed_at")
                .cloned()
                .unwrap_or_else(|| json!(claimed_at.to_rfc3339())),
            "expires_at": claim.get("expires_at").cloned().unwrap_or(Value::Null),
        })),
    ))
}

async fn redeem_offer_claim_placeholder(
    State(state): State<Arc<AppState>>,
    auth_user: Option<Extension<AuthUser>>,
    Path(id): Path<String>,
    Json(payload): Json<OfferClaimPayload>,
) -> Result<impl IntoResponse> {
    let offer_claim_id = security::validate_uuid_id(&id, "offer claim ID")?;
    let Some(Extension(auth_user)) = auth_user else {
        return Err(AppError::Unauthorized(
            "Sign in to record offer placeholder actions".into(),
        ));
    };
    let claim = find_offer_claim(&state, &offer_claim_id).await?;
    if value_str(&claim, "user_id") != auth_user.id {
        return Err(AppError::Forbidden(
            "Offer claim belongs to another user".into(),
        ));
    }

    let business_id = security::validate_uuid_id(value_str(&claim, "business_id"), "business ID")?;
    let deal_id = security::validate_uuid_id(value_str(&claim, "deal_id"), "deal ID")?;

    insert_offer_action_event(
        &state,
        "redemption_placeholder",
        &business_id,
        Some(&deal_id),
        Some(&offer_claim_id),
        Some(&auth_user),
        &payload,
    )
    .await?;

    Ok(Json(json!({
        "offer_claim_id": offer_claim_id,
        "status": "recorded",
        "verified": false,
    })))
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

async fn find_offer_claim(state: &AppState, id: &str) -> Result<Value> {
    let id = security::validate_uuid_id(id, "offer claim ID")?;
    state
        .db
        .supabase
        .select_one_json("offer_claims", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Offer claim not found".into()))
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

fn build_offer_claim_body(
    deal: &Value,
    business_id: &str,
    auth_user: &AuthUser,
    claimed_at: DateTime<Utc>,
) -> Result<Value> {
    let raw_deal_id = value_str(deal, "id");
    let raw_deal_id = if raw_deal_id.is_empty() {
        value_str(deal, "_id")
    } else {
        raw_deal_id
    };
    let deal_id = security::validate_uuid_id(raw_deal_id, "deal ID")?;
    let mut body = Map::new();
    body.insert("deal_id".into(), json!(deal_id));
    body.insert("business_id".into(), json!(business_id));
    body.insert("user_id".into(), json!(auth_user.id));
    body.insert("claim_code".into(), json!(generate_claim_code()));
    body.insert("status".into(), json!("claimed"));
    body.insert("claimed_at".into(), json!(claimed_at.to_rfc3339()));
    body.insert("created_at".into(), json!(claimed_at.to_rfc3339()));
    body.insert("updated_at".into(), json!(claimed_at.to_rfc3339()));
    body.insert("metadata".into(), json!({}));
    body.insert("affects_lvs".into(), json!(false));

    let valid_until = value_str(deal, "valid_until");
    if !valid_until.is_empty() {
        body.insert("expires_at".into(), json!(valid_until));
    }

    Ok(Value::Object(body))
}

async fn insert_offer_action_event(
    state: &AppState,
    event_type: &str,
    business_id: &str,
    deal_id: Option<&str>,
    offer_claim_id: Option<&str>,
    auth_user: Option<&AuthUser>,
    payload: &OfferClaimPayload,
) -> Result<()> {
    let mut body = Map::new();
    body.insert("event_type".into(), json!(event_type));
    body.insert("business_id".into(), json!(business_id));
    body.insert(
        "source_surface".into(),
        json!(payload
            .source_surface
            .as_deref()
            .and_then(|value| security::sanitize_optional_text(Some(value), 80))
            .unwrap_or_else(|| "business_modal".into())),
    );
    body.insert("constraints".into(), json!([]));
    body.insert("match_reason_codes".into(), json!([]));
    body.insert("location_context".into(), json!({}));
    body.insert(
        "metadata".into(),
        match &payload.metadata {
            Some(Value::Object(map)) => Value::Object(map.clone()),
            _ => json!({}),
        },
    );
    body.insert("affects_lvs".into(), json!(false));
    body.insert("created_at".into(), json!(Utc::now().to_rfc3339()));

    if let Some(user) = auth_user {
        body.insert("user_id".into(), json!(user.id));
    }
    if let Some(session_id) = payload
        .anonymous_session_id
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 120))
    {
        body.insert("anonymous_session_id".into(), json!(session_id));
    }
    if let Some(intent) = payload
        .intent
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 80))
    {
        body.insert("intent".into(), json!(intent));
    }
    if let Some(deal_id) = deal_id {
        body.insert("deal_id".into(), json!(deal_id));
    }
    if let Some(offer_claim_id) = offer_claim_id {
        body.insert("offer_claim_id".into(), json!(offer_claim_id));
    }

    state
        .db
        .supabase
        .insert_json("customer_events", Value::Object(body))
        .await?;
    Ok(())
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

fn generate_claim_code() -> String {
    let suffix: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(6)
        .map(char::from)
        .map(|value| value.to_ascii_uppercase())
        .collect();
    format!("VAN-{}", suffix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::auth::AuthUser;

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

    #[test]
    fn generated_claim_codes_have_customer_safe_shape() {
        let code = generate_claim_code();

        assert_eq!(code.len(), 10);
        assert!(code.starts_with("VAN-"));
        assert!(code
            .chars()
            .skip(4)
            .all(|value| value.is_ascii_uppercase() || value.is_ascii_digit()));
    }

    #[test]
    fn offer_claim_body_never_affects_visibility_score() {
        let claimed_at = DateTime::parse_from_rfc3339("2026-06-06T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let auth_user = AuthUser {
            id: "11111111-1111-4111-8111-111111111111".into(),
            email: "customer@example.com".into(),
            name: "Customer".into(),
            role: "customer".into(),
        };
        let deal = json!({
            "id": "22222222-2222-4222-8222-222222222222",
            "valid_until": "2026-06-12T12:00:00Z"
        });

        let body = build_offer_claim_body(
            &deal,
            "33333333-3333-4333-8333-333333333333",
            &auth_user,
            claimed_at,
        )
        .unwrap();

        assert_eq!(body["affects_lvs"], false);
        assert_eq!(body["status"], "claimed");
        assert_eq!(body["expires_at"], "2026-06-12T12:00:00Z");
    }
}

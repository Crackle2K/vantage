use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::value_str,
    security,
    state::AppState,
};
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Extension, Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::sync::Arc;

const CUSTOMER_EVENT_TYPES: &[&str] = &[
    "match_card_impression",
    "swipe_left",
    "swipe_right",
    "save",
    "match",
    "business_profile_open",
    "offer_claim",
    "directions_click",
    "check_in_placeholder",
    "redemption_placeholder",
    "campaign_impression",
    "campaign_open",
    "campaign_claim",
    "campaign_directions_click",
    "campaign_redemption_placeholder",
];

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/customer-events", post(create_customer_event))
}

#[derive(Deserialize)]
struct CustomerEventCreate {
    event_type: String,
    business_id: String,
    source_surface: String,
    anonymous_session_id: Option<String>,
    intent: Option<String>,
    constraints: Option<Value>,
    match_reason_codes: Option<Value>,
    deal_id: Option<String>,
    offer_claim_id: Option<String>,
    campaign_id: Option<String>,
    campaign_claim_id: Option<String>,
    location_context: Option<Value>,
    metadata: Option<Value>,
}

async fn create_customer_event(
    State(state): State<Arc<AppState>>,
    auth_user: Option<Extension<AuthUser>>,
    Json(payload): Json<CustomerEventCreate>,
) -> Result<impl IntoResponse> {
    let body = build_customer_event_body(payload, auth_user.as_ref().map(|extension| &extension.0))?;
    let created = state.db.supabase.insert_json("customer_events", body).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": value_str(&created, "id"),
            "created_at": created
                .get("created_at")
                .cloned()
                .unwrap_or_else(|| json!(Utc::now().to_rfc3339())),
        })),
    ))
}

fn build_customer_event_body(
    payload: CustomerEventCreate,
    auth_user: Option<&AuthUser>,
) -> Result<Value> {
    let event_type = validate_customer_event_type(&payload.event_type)?;
    let business_id = security::validate_uuid_id(&payload.business_id, "business ID")?;
    let source_surface = required_text(&payload.source_surface, "source_surface", 80)?;
    let anonymous_session_id = payload
        .anonymous_session_id
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 120));

    if auth_user.is_none() && anonymous_session_id.is_none() {
        return Err(AppError::BadRequest(
            "anonymous_session_id is required for anonymous events".into(),
        ));
    }

    let mut body = Map::new();
    body.insert("event_type".into(), json!(event_type));
    body.insert("business_id".into(), json!(business_id));
    body.insert("source_surface".into(), json!(source_surface));
    body.insert("affects_lvs".into(), json!(false));
    body.insert("created_at".into(), json!(Utc::now().to_rfc3339()));

    if let Some(user) = auth_user {
        body.insert("user_id".into(), json!(user.id));
    }
    if let Some(session_id) = anonymous_session_id {
        body.insert("anonymous_session_id".into(), json!(session_id));
    }
    if let Some(intent) = payload
        .intent
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 80))
    {
        body.insert("intent".into(), json!(intent));
    }
    if let Some(deal_id) = payload.deal_id.as_deref() {
        body.insert(
            "deal_id".into(),
            json!(security::validate_uuid_id(deal_id, "deal ID")?),
        );
    }
    if let Some(offer_claim_id) = payload.offer_claim_id.as_deref() {
        body.insert(
            "offer_claim_id".into(),
            json!(security::validate_uuid_id(offer_claim_id, "offer claim ID")?),
        );
    }
    if let Some(campaign_id) = payload.campaign_id.as_deref() {
        body.insert(
            "campaign_id".into(),
            json!(security::validate_uuid_id(campaign_id, "campaign ID")?),
        );
    }
    if let Some(campaign_claim_id) = payload.campaign_claim_id.as_deref() {
        body.insert(
            "campaign_claim_id".into(),
            json!(security::validate_uuid_id(
                campaign_claim_id,
                "campaign claim ID"
            )?),
        );
    }

    body.insert(
        "constraints".into(),
        json_array_or_empty(payload.constraints, "constraints")?,
    );
    body.insert(
        "match_reason_codes".into(),
        json_array_or_empty(payload.match_reason_codes, "match_reason_codes")?,
    );
    body.insert(
        "location_context".into(),
        json_object_or_empty(payload.location_context, "location_context")?,
    );
    body.insert(
        "metadata".into(),
        json_object_or_empty(payload.metadata, "metadata")?,
    );

    Ok(Value::Object(body))
}

fn validate_customer_event_type(value: &str) -> Result<&'static str> {
    let cleaned = security::sanitize_text(value, 80);
    CUSTOMER_EVENT_TYPES
        .iter()
        .copied()
        .find(|event_type| *event_type == cleaned)
        .ok_or_else(|| AppError::BadRequest("Invalid customer event type".into()))
}

fn required_text(value: &str, label: &str, max_len: usize) -> Result<String> {
    security::sanitize_optional_text(Some(value), max_len)
        .ok_or_else(|| AppError::BadRequest(format!("{} is required", label)))
}

fn json_array_or_empty(value: Option<Value>, label: &str) -> Result<Value> {
    match value {
        Some(Value::Array(items)) => Ok(Value::Array(items)),
        None => Ok(json!([])),
        _ => Err(AppError::BadRequest(format!("{} must be an array", label))),
    }
}

fn json_object_or_empty(value: Option<Value>, label: &str) -> Result<Value> {
    match value {
        Some(Value::Object(map)) => Ok(Value::Object(map)),
        None => Ok(json!({})),
        _ => Err(AppError::BadRequest(format!("{} must be an object", label))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_type_allowlist_rejects_ranking_or_paid_events() {
        assert!(validate_customer_event_type("match").is_ok());
        assert!(validate_customer_event_type("directions_click").is_ok());
        assert!(validate_customer_event_type("sponsored_rank_boost").is_err());
    }

    #[test]
    fn anonymous_events_require_anonymous_session_id() {
        let payload = CustomerEventCreate {
            event_type: "match".into(),
            business_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            source_surface: "decide".into(),
            anonymous_session_id: None,
            intent: None,
            constraints: None,
            match_reason_codes: None,
            deal_id: None,
            offer_claim_id: None,
            campaign_id: None,
            campaign_claim_id: None,
            location_context: None,
            metadata: None,
        };

        assert!(build_customer_event_body(payload, None).is_err());
    }

    #[test]
    fn event_body_always_marks_lvs_as_unaffected() {
        let payload = CustomerEventCreate {
            event_type: "save".into(),
            business_id: "550e8400-e29b-41d4-a716-446655440000".into(),
            source_surface: "saved".into(),
            anonymous_session_id: Some("anon_session".into()),
            intent: Some("DINNER".into()),
            constraints: Some(json!(["OPEN_NOW"])),
            match_reason_codes: Some(json!(["HIGH_TRUST"])),
            deal_id: None,
            offer_claim_id: None,
            campaign_id: None,
            campaign_claim_id: None,
            location_context: Some(json!({ "radius_km": 8 })),
            metadata: Some(json!({ "card_index": 1 })),
        };
        let body = build_customer_event_body(payload, None).unwrap();

        assert_eq!(body["affects_lvs"], false);
        assert_eq!(body["constraints"], json!(["OPEN_NOW"]));
        assert_eq!(body["metadata"]["card_index"], 1);
    }
}

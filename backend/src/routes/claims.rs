use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{eq, normalize_id_alias, order, q, select_all, value_str},
    security,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde_json::{json, Map, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/claims", post(submit_claim))
        .route("/claims/my", get(my_claims))
        .route("/claims/mine", get(my_claims))
        .route("/claims/:id", get(get_claim).put(review_claim))
}

async fn submit_claim(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    if auth_user.role != "business_owner" && auth_user.role != "admin" {
        return Err(AppError::Forbidden(
            "Business owner account required".into(),
        ));
    }

    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;
    let business_id = security::validate_uuid_id(business_id, "business ID")?;

    let business = state
        .db
        .supabase
        .select_one_json("businesses", &[q("select", "id"), eq("id", &business_id)])
        .await?;
    if business.is_none() {
        return Err(AppError::NotFound("Business not found".into()));
    }

    let existing = state
        .db
        .supabase
        .select_one_json(
            "claims",
            &[
                select_all(),
                eq("business_id", &business_id),
                eq("user_id", &auth_user.id),
                eq("status", "pending"),
            ],
        )
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("Claim already pending".into()));
    }

    let now = Utc::now().to_rfc3339();
    let mut body = Map::new();
    body.insert("business_id".into(), json!(business_id));
    body.insert("user_id".into(), json!(auth_user.id));
    body.insert(
        "verification_method".into(),
        json!(payload["verification_method"].as_str().unwrap_or("manual")),
    );
    body.insert("status".into(), json!("pending"));
    body.insert("created_at".into(), json!(now));
    body.insert("updated_at".into(), json!(now));

    insert_optional(&mut body, "owner_name", payload["owner_name"].as_str(), 120);
    insert_optional(&mut body, "owner_role", payload["owner_role"].as_str(), 120);
    insert_optional(
        &mut body,
        "owner_phone",
        payload["owner_phone"].as_str(),
        40,
    );
    insert_optional(
        &mut body,
        "owner_email",
        payload["owner_email"].as_str(),
        180,
    );
    insert_optional(
        &mut body,
        "proof_description",
        payload["proof_description"]
            .as_str()
            .or_else(|| payload["notes"].as_str()),
        1000,
    );

    let created = state
        .db
        .supabase
        .insert_json("claims", Value::Object(body))
        .await?;

    Ok((StatusCode::CREATED, Json(normalize_id_alias(created))))
}

async fn get_claim(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let claim = find_claim(&state, &id).await?;
    ensure_claim_access(&claim, &auth_user)?;
    Ok(Json(normalize_id_alias(claim)))
}

async fn my_claims(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let claims = state
        .db
        .supabase
        .select_json(
            "claims",
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

    Ok(Json(json!({ "items": claims, "claims": claims })))
}

async fn review_claim(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    if auth_user.role != "admin" {
        return Err(AppError::Forbidden("Admin only".into()));
    }

    let status = payload["status"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("status required".into()))?;
    let normalized_status = match status {
        "approved" | "verified" => "verified",
        "rejected" => "rejected",
        _ => {
            return Err(AppError::BadRequest(
                "status must be verified or rejected".into(),
            ))
        }
    };

    let existing = find_claim(&state, &id).await?;
    let now = Utc::now().to_rfc3339();
    let updated = state
        .db
        .supabase
        .update_json(
            "claims",
            &[eq("id", &id)],
            json!({
                "status": normalized_status,
                "reviewed_by": auth_user.id,
                "reviewed_at": now,
                "updated_at": now,
                "review_notes": security::sanitize_optional_text(payload["notes"].as_str(), 1000),
            }),
        )
        .await?;

    if normalized_status == "verified" {
        state
            .db
            .supabase
            .update_json(
                "businesses",
                &[eq("id", value_str(&existing, "business_id"))],
                json!({
                    "is_claimed": true,
                    "owner_id": value_str(&existing, "user_id"),
                    "updated_at": Utc::now().to_rfc3339(),
                }),
            )
            .await
            .ok();
    }

    let claim = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Claim not found".into()))?;
    Ok(Json(normalize_id_alias(claim)))
}

async fn find_claim(state: &AppState, id: &str) -> Result<Value> {
    let id = security::validate_uuid_id(id, "claim ID")?;
    state
        .db
        .supabase
        .select_one_json("claims", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Claim not found".into()))
}

fn ensure_claim_access(claim: &Value, auth_user: &AuthUser) -> Result<()> {
    if auth_user.role == "admin" || value_str(claim, "user_id") == auth_user.id {
        return Ok(());
    }
    Err(AppError::Forbidden("Not your claim".into()))
}

fn insert_optional(body: &mut Map<String, Value>, key: &str, value: Option<&str>, max: usize) {
    if let Some(value) = value.and_then(|raw| security::sanitize_optional_text(Some(raw), max)) {
        body.insert(key.into(), json!(value));
    }
}

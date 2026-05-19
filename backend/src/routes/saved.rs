use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{eq, normalize_business, order, q, select_all, value_str},
    security,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/saved", get(list_saved)).route(
        "/saved/:business_id",
        post(save_business).delete(unsave_business),
    )
}

async fn list_saved(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let saved = state
        .db
        .supabase
        .select_json(
            "saved_businesses",
            &[
                select_all(),
                eq("user_id", &auth_user.id),
                order("created_at.desc"),
            ],
        )
        .await?;

    let mut items = Vec::new();
    for saved_row in saved {
        let business_id = value_str(&saved_row, "business_id");
        if business_id.is_empty() {
            continue;
        }
        if let Some(mut business) = state
            .db
            .supabase
            .select_one_json("businesses", &[select_all(), eq("id", business_id)])
            .await?
        {
            business["saved_at"] = saved_row.get("created_at").cloned().unwrap_or(Value::Null);
            items.push(normalize_business(business));
        }
    }

    Ok(Json(json!({ "items": items })))
}

async fn save_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
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
            "saved_businesses",
            &[
                select_all(),
                eq("user_id", &auth_user.id),
                eq("business_id", &business_id),
            ],
        )
        .await?;
    if existing.is_none() {
        state
            .db
            .supabase
            .insert_json(
                "saved_businesses",
                json!({
                    "user_id": auth_user.id,
                    "business_id": business_id,
                    "created_at": Utc::now().to_rfc3339(),
                }),
            )
            .await?;
    }

    Ok(Json(json!({ "saved": true, "business_id": business_id })))
}

async fn unsave_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    state
        .db
        .supabase
        .delete_json(
            "saved_businesses",
            &[
                eq("user_id", &auth_user.id),
                eq("business_id", &business_id),
            ],
        )
        .await?;

    Ok(Json(json!({ "saved": false, "business_id": business_id })))
}

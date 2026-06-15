use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{
        eq, limit, normalize_business, order, pagination_headers, pagination_meta,
        pagination_window, q, select_all, value_str,
    },
    security,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/saved", get(list_saved)).route(
        "/saved/:business_id",
        post(save_business).delete(unsave_business),
    )
}

#[derive(Deserialize)]
struct SavedParams {
    limit: Option<i64>,
    offset: Option<i64>,
    cursor: Option<String>,
    include_pagination: Option<bool>,
}

async fn list_saved(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Query(params): Query<SavedParams>,
) -> Result<impl IntoResponse> {
    let window = pagination_window(
        params.limit,
        params.offset,
        params.cursor.as_deref(),
        50,
        100,
    )?;
    let mut saved = state
        .db
        .supabase
        .select_json(
            "saved_businesses",
            &[
                select_all(),
                eq("user_id", &auth_user.id),
                order("created_at.desc"),
                limit(window.limit + 1),
                crate::routes::support::offset(window.offset),
            ],
        )
        .await?;
    let meta = pagination_meta(window.limit, window.offset, saved.len());
    saved.truncate(window.limit as usize);

    let business_ids = saved
        .iter()
        .filter_map(|row| {
            let id = value_str(row, "business_id");
            (!id.is_empty()).then(|| id.to_string())
        })
        .collect::<Vec<_>>();
    let businesses = fetch_businesses_by_ids(&state, &business_ids).await?;

    let mut items = Vec::new();
    for saved_row in &saved {
        let business_id = value_str(saved_row, "business_id");
        if let Some(mut business) = businesses.get(business_id).cloned() {
            business["saved_at"] = saved_row.get("created_at").cloned().unwrap_or(Value::Null);
            items.push(normalize_business(business));
        }
    }

    let body = if params.include_pagination.unwrap_or(false) {
        json!({
            "items": items,
            "pagination": &meta,
            "has_more": meta.has_more,
            "next_cursor": meta.next_cursor.clone(),
        })
    } else {
        json!({ "items": items })
    };

    Ok((pagination_headers(&meta), Json(body)))
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
            .await
            .map_err(map_save_insert_error)?;
    }

    Ok(Json(json!({ "saved": true, "business_id": business_id })))
}

async fn unsave_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    let deleted = state
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
    if deleted.is_empty() {
        return Err(AppError::NotFound("Saved business not found".into()));
    }

    Ok(Json(json!({ "saved": false, "business_id": business_id })))
}

async fn fetch_businesses_by_ids(
    state: &AppState,
    business_ids: &[String],
) -> Result<HashMap<String, Value>> {
    if business_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut unique_ids = Vec::new();
    for id in business_ids {
        let id = security::validate_uuid_id(id, "business ID")?;
        if !unique_ids.contains(&id) {
            unique_ids.push(id);
        }
    }

    let rows = state
        .db
        .supabase
        .select_json(
            "businesses",
            &[
                select_all(),
                q("id", format!("in.({})", unique_ids.join(","))),
            ],
        )
        .await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let id = value_str(&row, "id").to_string();
            (!id.is_empty()).then_some((id, row))
        })
        .collect())
}

fn map_save_insert_error(err: anyhow::Error) -> AppError {
    let message = err.to_string().to_ascii_lowercase();
    if message.contains("duplicate") || message.contains("unique") {
        AppError::Conflict("Business already saved".into())
    } else {
        err.into()
    }
}

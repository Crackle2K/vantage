use crate::{errors::{AppError, Result}, middleware::auth::AuthUser, state::AppState};
use axum::{
    extract::{Extension, Path, State},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::Utc;
use mongodb::bson::{doc, Document};
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/saved", get(list_saved))
        .route("/saved/:business_id", post(save_business).delete(unsave_business))
}

async fn list_saved(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("saved");
    let mut cursor = col
        .find(doc! { "user_id": &auth_user.id })
        .sort(doc! { "created_at": -1 })
        .await?;

    let mut saved: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        saved.push(serde_json::to_value(&cursor.deserialize_current()?).unwrap_or(Value::Null));
    }

    Ok(Json(json!({ "saved": saved })))
}

async fn save_business(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("saved");

    if col
        .find_one(doc! { "user_id": &auth_user.id, "business_id": &business_id })
        .await?
        .is_some()
    {
        return Ok(Json(json!({ "saved": true, "business_id": business_id })));
    }

    let now = Utc::now();
    col.insert_one(doc! {
        "user_id": &auth_user.id,
        "business_id": &business_id,
        "created_at": now.to_rfc3339(),
    })
    .await?;

    Ok(Json(json!({ "saved": true, "business_id": business_id })))
}

async fn unsave_business(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("saved");
    col.delete_one(doc! { "user_id": &auth_user.id, "business_id": &business_id })
        .await?;
    Ok(Json(json!({ "saved": false, "business_id": business_id })))
}

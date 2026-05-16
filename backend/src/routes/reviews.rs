use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    state::AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/reviews", post(create_review))
        .route("/reviews/:id", get(get_review).put(update_review).delete(delete_review))
        .route("/businesses/:id/reviews", get(list_business_reviews))
}

#[derive(Deserialize)]
struct PaginationParams {
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_business_reviews(
    State(state): State<Arc<AppState>>,
    Path(business_id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("reviews");
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let mut cursor = collection
        .find(doc! { "business_id": &business_id })
        .skip(offset as u64)
        .limit(limit)
        .sort(doc! { "created_at": -1 })
        .await?;

    let mut reviews: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        reviews.push(serde_json::to_value(&doc).unwrap_or(Value::Null));
    }

    Ok(Json(json!({ "reviews": reviews })))
}

async fn get_review(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: mongodb::Collection<Document> = state.db.mongo.collection("reviews");
    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid review ID".into()))?;

    let doc = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Review not found".into()))?;

    Ok(Json(serde_json::to_value(&doc).unwrap_or(Value::Null)))
}

#[derive(serde::Deserialize)]
struct ReviewCreate {
    business_id: String,
    rating: f64,
    comment: Option<String>,
}

async fn create_review(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<ReviewCreate>,
) -> Result<impl IntoResponse> {
    if payload.rating < 1.0 || payload.rating > 5.0 {
        return Err(AppError::BadRequest("Rating must be between 1 and 5".into()));
    }

    let reviews: mongodb::Collection<Document> = state.db.mongo.collection("reviews");

    // One review per user per business
    if reviews
        .find_one(doc! {
            "business_id": &payload.business_id,
            "user_id": &auth_user.id,
        })
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("You have already reviewed this business".into()));
    }

    let now = Utc::now();
    let review_doc = doc! {
        "business_id": &payload.business_id,
        "user_id": &auth_user.id,
        "rating": payload.rating,
        "comment": payload.comment.clone().unwrap_or_default(),
        "is_verified": false,
        "credibility_weight": 1.0,
        "helpful_count": 0,
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
    };

    let result = reviews.insert_one(review_doc).await?;
    let id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    // Update business aggregate rating
    update_business_rating(&state, &payload.business_id).await?;

    Ok((StatusCode::CREATED, Json(json!({ "id": id }))))
}

#[derive(serde::Deserialize)]
struct ReviewUpdate {
    rating: Option<f64>,
    comment: Option<String>,
}

async fn update_review(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(payload): Json<ReviewUpdate>,
) -> Result<impl IntoResponse> {
    let reviews: mongodb::Collection<Document> = state.db.mongo.collection("reviews");
    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid review ID".into()))?;

    let existing = reviews
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Review not found".into()))?;

    if existing.get_str("user_id").unwrap_or("") != auth_user.id {
        return Err(AppError::Forbidden("Not your review".into()));
    }

    let now = Utc::now();
    let mut update = doc! { "updated_at": now.to_rfc3339() };
    if let Some(r) = payload.rating {
        update.insert("rating", r);
    }
    if let Some(c) = payload.comment {
        update.insert("comment", c);
    }

    reviews
        .update_one(doc! { "_id": oid }, doc! { "$set": update })
        .await?;

    let business_id = existing.get_str("business_id").unwrap_or("").to_string();
    update_business_rating(&state, &business_id).await?;

    Ok(Json(json!({ "message": "Review updated" })))
}

async fn delete_review(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let reviews: mongodb::Collection<Document> = state.db.mongo.collection("reviews");
    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid review ID".into()))?;

    let existing = reviews
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Review not found".into()))?;

    if existing.get_str("user_id").unwrap_or("") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not your review".into()));
    }

    let business_id = existing.get_str("business_id").unwrap_or("").to_string();
    reviews.delete_one(doc! { "_id": oid }).await?;
    update_business_rating(&state, &business_id).await?;

    Ok(Json(json!({ "message": "Review deleted" })))
}

async fn update_business_rating(state: &AppState, business_id: &str) -> Result<()> {
    let reviews: mongodb::Collection<Document> = state.db.mongo.collection("reviews");
    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");

    let pipeline = vec![
        doc! { "$match": { "business_id": business_id } },
        doc! { "$group": {
            "_id": null,
            "avg_rating": { "$avg": "$rating" },
            "count": { "$sum": 1 }
        }},
    ];

    let mut cursor = reviews.aggregate(pipeline).await?;
    if cursor.advance().await? {
        let agg = cursor.deserialize_current()?;
        let avg = agg.get_f64("avg_rating").unwrap_or(0.0);
        let count = agg.get_i32("count").unwrap_or(0);

        businesses
            .update_one(
                doc! { "_id": business_id },
                doc! { "$set": { "rating": avg, "review_count": count } },
            )
            .await
            .ok();
    }

    Ok(())
}

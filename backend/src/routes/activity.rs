use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    security,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use mongodb::bson::{doc, Document};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/activity", get(get_feed))
        .route("/activity/checkin", post(check_in))
        .route("/activity/owner-post", post(create_owner_post))
        .route("/activity/credibility/:user_id", get(get_credibility))
        .route("/credibility/me", get(get_my_credibility))
        .route("/feed/:id/like", post(toggle_like))
        .route("/feed/:id/comments", get(get_comments).post(add_comment))
        .route("/feed/posts", post(create_feed_post))
}

#[derive(Deserialize)]
struct FeedParams {
    limit: Option<i64>,
    offset: Option<i64>,
    business_id: Option<String>,
}

async fn get_feed(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FeedParams>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("activity_feed");
    let limit = params.limit.unwrap_or(20).min(50);
    let offset = params.offset.unwrap_or(0);

    let mut filter = doc! {};
    if let Some(biz_id) = &params.business_id {
        filter.insert("business_id", biz_id.as_str());
    }

    let mut cursor = col
        .find(filter)
        .sort(doc! { "created_at": -1 })
        .skip(offset as u64)
        .limit(limit)
        .await?;

    let mut items: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        items.push(serde_json::to_value(&cursor.deserialize_current()?).unwrap_or(Value::Null));
    }

    Ok(Json(json!({ "items": items })))
}

async fn check_in(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;

    let lat = payload["lat"].as_f64();
    let lng = payload["lng"].as_f64();
    if let (Some(lat), Some(lng)) = (lat, lng) {
        security::validate_lat_lng(lat, lng)?;
    }

    // Geo-verify if coordinates provided
    let is_geo_verified = if let (Some(lat), Some(lng)) = (lat, lng) {
        // Look up business location and verify within 100m
        let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
        if let Ok(Some(biz)) = businesses.find_one(doc! { "_id": business_id }).await {
            if let Ok(loc) = biz.get_document("location") {
                if let Ok(coords) = loc.get_array("coordinates") {
                    if coords.len() == 2 {
                        let biz_lng = coords[0].as_f64().unwrap_or(0.0);
                        let biz_lat = coords[1].as_f64().unwrap_or(0.0);
                        let dist = haversine_km(lat, lng, biz_lat, biz_lng);
                        dist < 0.1 // within 100m
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    let checkins: mongodb::Collection<Document> = state.db.mongo.collection("checkins");
    let now = Utc::now();
    let checkin_doc = doc! {
        "business_id": business_id,
        "user_id": &auth_user.id,
        "lat": lat.unwrap_or(0.0),
        "lng": lng.unwrap_or(0.0),
        "is_geo_verified": is_geo_verified,
        "created_at": now.to_rfc3339(),
    };
    let result = checkins.insert_one(checkin_doc).await?;
    let id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    // Add to activity feed
    let feed: mongodb::Collection<Document> = state.db.mongo.collection("activity_feed");
    feed.insert_one(doc! {
        "activity_type": "check_in",
        "business_id": business_id,
        "user_id": &auth_user.id,
        "is_geo_verified": is_geo_verified,
        "created_at": now.to_rfc3339(),
    })
    .await
    .ok();

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "is_geo_verified": is_geo_verified })),
    ))
}

async fn create_owner_post(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;
    let content = payload["content"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("content required".into()))?;
    let content = security::sanitize_text(content, 2000);
    if content.is_empty() {
        return Err(AppError::BadRequest("content required".into()));
    }
    let image_url = security::normalize_url(payload["image_url"].as_str(), 500, true)?;

    let businesses: mongodb::Collection<Document> = state.db.mongo.collection("businesses");
    let biz = businesses
        .find_one(doc! { "_id": business_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    if biz.get_str("owner_id").unwrap_or("") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }

    let col: mongodb::Collection<Document> = state.db.mongo.collection("owner_posts");
    let now = Utc::now();
    let post_doc = doc! {
        "business_id": business_id,
        "owner_id": &auth_user.id,
        "content": content,
        "image_url": image_url.unwrap_or_default(),
        "created_at": now.to_rfc3339(),
        "updated_at": now.to_rfc3339(),
    };
    let result = col.insert_one(post_doc).await?;
    let id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    Ok((StatusCode::CREATED, Json(json!({ "id": id }))))
}

async fn get_credibility(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse> {
    let checkins: mongodb::Collection<Document> = state.db.mongo.collection("checkins");
    let reviews: mongodb::Collection<Document> = state.db.mongo.collection("reviews");

    let check_in_count = checkins
        .count_documents(doc! { "user_id": &user_id })
        .await? as i32;
    let review_count = reviews
        .count_documents(doc! { "user_id": &user_id })
        .await? as i32;

    let score =
        crate::models::activity::calculate_credibility_score(check_in_count, review_count, 0);
    let tier = crate::models::activity::credibility_tier(score);

    Ok(Json(json!({
        "user_id": user_id,
        "score": score,
        "tier": tier,
        "check_in_count": check_in_count,
        "review_count": review_count,
    })))
}

async fn get_my_credibility(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let checkins: mongodb::Collection<Document> = state.db.mongo.collection("checkins");
    let reviews: mongodb::Collection<Document> = state.db.mongo.collection("reviews");

    let check_in_count = checkins
        .count_documents(doc! { "user_id": &auth_user.id })
        .await? as i32;
    let review_count = reviews
        .count_documents(doc! { "user_id": &auth_user.id })
        .await? as i32;

    let score =
        crate::models::activity::calculate_credibility_score(check_in_count, review_count, 0);
    let tier = crate::models::activity::credibility_tier(score);

    Ok(Json(json!({
        "user_id": auth_user.id,
        "score": score,
        "tier": tier,
        "check_in_count": check_in_count,
        "review_count": review_count,
    })))
}

async fn toggle_like(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let feed: mongodb::Collection<Document> = state.db.mongo.collection("activity_feed");
    let oid = mongodb::bson::oid::ObjectId::parse_str(&id)
        .map_err(|_| AppError::BadRequest("Invalid activity id".into()))?;

    let existing = feed
        .find_one(doc! { "_id": oid, "likes": &auth_user.id })
        .await?;
    let (update, liked) = if existing.is_some() {
        (
            doc! { "$pull": { "likes": &auth_user.id }, "$inc": { "like_count": -1i32 } },
            false,
        )
    } else {
        (
            doc! { "$addToSet": { "likes": &auth_user.id }, "$inc": { "like_count": 1i32 } },
            true,
        )
    };

    feed.update_one(doc! { "_id": oid }, update).await?;

    Ok(Json(json!({ "liked": liked })))
}

async fn get_comments(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let col: mongodb::Collection<Document> = state.db.mongo.collection("activity_comments");
    let mut cursor = col
        .find(doc! { "activity_id": &id })
        .sort(doc! { "created_at": 1 })
        .await?;

    let mut comments: Vec<Value> = Vec::new();
    while cursor.advance().await? {
        comments.push(serde_json::to_value(&cursor.deserialize_current()?).unwrap_or(Value::Null));
    }

    Ok(Json(json!(comments)))
}

async fn add_comment(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let content = payload["content"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("content required".into()))?;
    let content = security::sanitize_text(content, 1000);
    if content.is_empty() {
        return Err(AppError::BadRequest("content required".into()));
    }

    let col: mongodb::Collection<Document> = state.db.mongo.collection("activity_comments");
    let now = Utc::now();
    let comment_doc = doc! {
        "activity_id": &id,
        "user_id": &auth_user.id,
        "content": &content,
        "created_at": now.to_rfc3339(),
    };
    let result = col.insert_one(comment_doc).await?;
    let comment_id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    // Increment comment count on the feed item
    if let Ok(oid) = mongodb::bson::oid::ObjectId::parse_str(&id) {
        let feed: mongodb::Collection<Document> = state.db.mongo.collection("activity_feed");
        feed.update_one(
            doc! { "_id": oid },
            doc! { "$inc": { "comment_count": 1i32 } },
        )
        .await
        .ok();
    }

    let comment_count = col.count_documents(doc! { "activity_id": &id }).await? as i64;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "comment": { "id": comment_id, "activity_id": id, "user_id": auth_user.id, "content": content, "created_at": now.to_rfc3339() },
            "comments": comment_count,
        })),
    ))
}

async fn create_feed_post(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;
    let content = payload["content"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("content required".into()))?;
    let content = security::sanitize_text(content, 2000);
    if content.is_empty() {
        return Err(AppError::BadRequest("content required".into()));
    }
    let image_url = security::normalize_url(payload["image_url"].as_str(), 500, true)?;

    let col: mongodb::Collection<Document> = state.db.mongo.collection("owner_posts");
    let now = Utc::now();
    let post_doc = doc! {
        "business_id": business_id,
        "owner_id": &auth_user.id,
        "content": content,
        "image_url": image_url.unwrap_or_default(),
        "activity_type": "owner_post",
        "created_at": now.to_rfc3339(),
    };
    let result = col.insert_one(post_doc).await?;
    let post_id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    Ok((StatusCode::CREATED, Json(json!({ "id": post_id }))))
}

fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const R: f64 = 6371.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    2.0 * R * a.sqrt().asin()
}

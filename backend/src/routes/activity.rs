use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{
        business_lat_lng, eq, limit, normalize_id_alias, offset, order, select_all, value_i64,
        value_str,
    },
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
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/activity", get(get_feed))
        .route("/feed", get(get_feed))
        .route("/activity/checkin", post(check_in))
        .route("/checkins", post(check_in))
        .route("/activity/owner-post", post(create_owner_post))
        .route("/activity/credibility/:user_id", get(get_credibility))
        .route("/credibility/me", get(get_my_credibility))
        .route("/feed/:id/like", post(toggle_like))
        .route("/feed/:id/comments", get(get_comments).post(add_comment))
        .route("/feed/posts", post(create_feed_post))
        .route("/activity/pulse", get(get_activity_pulse))
        .route("/businesses/:id/activity", get(get_business_activity))
        .route("/events", get(list_owner_events).post(create_owner_event))
}

#[derive(Deserialize)]
struct FeedParams {
    limit: Option<i64>,
    offset: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
    business_id: Option<String>,
}

async fn get_feed(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FeedParams>,
) -> Result<impl IntoResponse> {
    let page_size = params.page_size.or(params.limit).unwrap_or(20).clamp(1, 50);
    let offset_value = params
        .offset
        .unwrap_or_else(|| (params.page.unwrap_or(1).max(1) - 1) * page_size);

    let mut query = vec![
        select_all(),
        order("created_at.desc"),
        limit(page_size + 1),
        offset(offset_value),
    ];
    if let Some(business_id) = params
        .business_id
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        query.push(eq("business_id", business_id));
    }

    let mut rows = state
        .db
        .supabase
        .select_json("activity_feed", &query)
        .await?
        .into_iter()
        .map(normalize_activity_item)
        .collect::<Vec<_>>();
    let has_more = rows.len() > page_size as usize;
    rows.truncate(page_size as usize);

    Ok(Json(json!({ "items": rows, "has_more": has_more })))
}

async fn check_in(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;

    let lat = payload["lat"].as_f64().or(payload["latitude"].as_f64());
    let lng = payload["lng"].as_f64().or(payload["longitude"].as_f64());
    if let (Some(lat), Some(lng)) = (lat, lng) {
        security::validate_lat_lng(lat, lng)?;
    }

    let business = find_business(&state, business_id).await?;
    let distance = if let (Some(user_lat), Some(user_lng), Some((biz_lat, biz_lng))) =
        (lat, lng, business_lat_lng(&business))
    {
        Some(crate::services::geo_service::haversine_km(
            user_lat, user_lng, biz_lat, biz_lng,
        ))
    } else {
        None
    };
    let is_geo_verified = distance.map(|value| value <= 0.1).unwrap_or(false);
    let status = if is_geo_verified {
        "geo_verified"
    } else {
        "self_reported"
    };
    let now = Utc::now().to_rfc3339();

    let checkin = state
        .db
        .supabase
        .insert_json(
            "checkins",
            json!({
                "business_id": business_id,
                "user_id": auth_user.id,
                "status": status,
                "latitude": lat,
                "longitude": lng,
                "distance_from_business": distance,
                "note": security::sanitize_optional_text(payload["note"].as_str(), 500),
                "is_geo_verified": is_geo_verified,
                "confirmations": 0,
                "confirmed_by": [],
                "created_at": now,
            }),
        )
        .await?;

    let title = if is_geo_verified {
        format!("{} checked in with location verification", auth_user.email)
    } else {
        format!("{} checked in", auth_user.email)
    };
    insert_activity(
        &state,
        json!({
            "activity_type": "checkin",
            "user_id": auth_user.id,
            "user_name": auth_user.email,
            "business_id": business_id,
            "business_name": value_str(&business, "name"),
            "business_category": value_str(&business, "category"),
            "title": title,
            "description": security::sanitize_optional_text(payload["note"].as_str(), 500),
            "likes": 0,
            "comments": 0,
            "liked_by": [],
            "created_at": Utc::now().to_rfc3339(),
        }),
    )
    .await
    .ok();

    Ok((StatusCode::CREATED, Json(normalize_checkin(checkin))))
}

async fn create_owner_post(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    create_business_activity_post(&state, &auth_user, payload).await
}

async fn get_credibility(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse> {
    credibility_response(&state, &user_id).await.map(Json)
}

async fn get_my_credibility(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    credibility_response(&state, &auth_user.id).await.map(Json)
}

async fn toggle_like(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let existing = find_activity(&state, &id).await?;
    let mut liked_by = existing["liked_by"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>();

    let liked = if liked_by.iter().any(|user_id| user_id == &auth_user.id) {
        liked_by.retain(|user_id| user_id != &auth_user.id);
        false
    } else {
        liked_by.push(auth_user.id.clone());
        true
    };
    let likes = liked_by.len() as i64;
    let comments = value_i64(&existing, "comments");

    state
        .db
        .supabase
        .update_json(
            "activity_feed",
            &[eq("id", &id)],
            json!({ "liked_by": liked_by, "likes": likes }),
        )
        .await?;

    Ok(Json(
        json!({ "liked": liked, "likes": likes, "comments": comments }),
    ))
}

async fn get_comments(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let comments = state
        .db
        .supabase
        .select_json(
            "activity_comments",
            &[
                select_all(),
                eq("activity_id", &id),
                order("created_at.asc"),
            ],
        )
        .await?
        .into_iter()
        .map(normalize_comment)
        .collect::<Vec<_>>();

    Ok(Json(comments))
}

async fn add_comment(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    find_activity(&state, &id).await?;
    let content = payload["content"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("content required".into()))?;
    let content = security::sanitize_text(content, 1000);
    if content.is_empty() {
        return Err(AppError::BadRequest("content required".into()));
    }

    let now = Utc::now().to_rfc3339();
    let comment = state
        .db
        .supabase
        .insert_json(
            "activity_comments",
            json!({
                "activity_id": id,
                "user_id": auth_user.id,
                "user_name": auth_user.email,
                "content": content,
                "created_at": now,
            }),
        )
        .await?;

    let comment_count = state
        .db
        .supabase
        .count("activity_comments", &[eq("activity_id", &id)])
        .await? as i64;
    state
        .db
        .supabase
        .update_json(
            "activity_feed",
            &[eq("id", &id)],
            json!({ "comments": comment_count }),
        )
        .await
        .ok();

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "comment": normalize_comment(comment),
            "comments": comment_count,
        })),
    ))
}

async fn create_feed_post(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    let content = payload["content"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("content required".into()))?;
    let content = security::sanitize_text(content, 2000);
    if content.is_empty() {
        return Err(AppError::BadRequest("content required".into()));
    }

    let business = if let Some(business_id) = payload["business_id"].as_str() {
        Some(find_business(&state, business_id).await?)
    } else {
        None
    };

    let item = insert_activity(
        &state,
        json!({
            "activity_type": "user_post",
            "user_id": auth_user.id,
            "user_name": auth_user.email,
            "business_id": business.as_ref().map(|row| value_str(row, "id")),
            "business_name": business.as_ref().map(|row| value_str(row, "name")).unwrap_or("Community"),
            "business_category": business.as_ref().map(|row| value_str(row, "category")),
            "title": "Community post",
            "description": content,
            "likes": 0,
            "comments": 0,
            "liked_by": [],
            "created_at": Utc::now().to_rfc3339(),
        }),
    )
    .await?;

    Ok((StatusCode::CREATED, Json(normalize_activity_item(item))))
}

async fn get_activity_pulse(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FeedParams>,
) -> Result<impl IntoResponse> {
    let rows = state
        .db
        .supabase
        .select_json(
            "activity_feed",
            &[
                select_all(),
                order("created_at.desc"),
                limit(params.limit.unwrap_or(10).clamp(1, 30)),
            ],
        )
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": value_str(&row, "id"),
                "type": value_str(&row, "activity_type"),
                "summary": value_str(&row, "title"),
                "detail": value_str(&row, "description"),
                "timestamp": value_str(&row, "created_at"),
                "business": {
                    "business_id": value_str(&row, "business_id"),
                    "name": value_str(&row, "business_name"),
                    "category": value_str(&row, "business_category"),
                }
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(json!({ "items": rows })))
}

async fn get_business_activity(
    State(state): State<Arc<AppState>>,
    Path(business_id): Path<String>,
) -> Result<impl IntoResponse> {
    let checkins = state
        .db
        .supabase
        .select_json(
            "checkins",
            &[
                select_all(),
                eq("business_id", &business_id),
                order("created_at.desc"),
            ],
        )
        .await?;
    let feed = state
        .db
        .supabase
        .select_json(
            "activity_feed",
            &[
                select_all(),
                eq("business_id", &business_id),
                order("created_at.desc"),
            ],
        )
        .await?;

    let today_prefix = Utc::now().format("%Y-%m-%d").to_string();
    let checkins_today = checkins
        .iter()
        .filter(|row| value_str(row, "created_at").starts_with(&today_prefix))
        .count() as i64;

    Ok(Json(json!({
        "business_id": business_id,
        "is_active_today": checkins_today > 0,
        "checkins_today": checkins_today,
        "checkins_this_week": checkins.len(),
        "last_checkin_at": checkins.first().and_then(|row| row.get("created_at")).cloned(),
        "recent_activity_count": feed.len(),
        "trending_score": (checkins_today as f64 * 2.0) + feed.len() as f64,
    })))
}

#[derive(Deserialize)]
struct EventParams {
    business_id: Option<String>,
    limit: Option<i64>,
    include_past: Option<bool>,
    lat: Option<f64>,
    lng: Option<f64>,
    radius: Option<f64>,
}

async fn list_owner_events(
    State(state): State<Arc<AppState>>,
    Query(params): Query<EventParams>,
) -> Result<impl IntoResponse> {
    let mut query = vec![
        select_all(),
        order("start_time.asc"),
        limit(params.limit.unwrap_or(20).clamp(1, 100)),
    ];
    if let Some(business_id) = params
        .business_id
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        query.push(eq("business_id", business_id));
    }

    let mut events = state
        .db
        .supabase
        .select_json("owner_events", &query)
        .await?
        .into_iter()
        .map(normalize_id_alias)
        .collect::<Vec<_>>();

    if !params.include_past.unwrap_or(false) {
        let now = Utc::now().to_rfc3339();
        events.retain(|event| value_str(event, "end_time") >= now.as_str());
    }

    for event in &mut events {
        if let Ok(business) = find_business(&state, value_str(event, "business_id")).await {
            event["business_name"] = json!(value_str(&business, "name"));
            event["business_category"] = json!(value_str(&business, "category"));
            event["business_image_url"] = business
                .get("primary_image_url")
                .or_else(|| business.get("image_url"))
                .cloned()
                .unwrap_or(Value::Null);
        }
    }

    Ok(Json(events))
}

async fn create_owner_event(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    let business_id = payload["business_id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("business_id required".into()))?;
    let business = find_business(&state, business_id).await?;
    ensure_business_owner(&business, &auth_user)?;

    let title = payload["title"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("title required".into()))?;
    let description = payload["description"].as_str().unwrap_or("");
    let start_time = payload["start_time"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("start_time required".into()))?;
    let end_time = payload["end_time"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("end_time required".into()))?;
    let image_url = security::normalize_url(payload["image_url"].as_str(), 500, true)?;

    let event = state
        .db
        .supabase
        .insert_json(
            "owner_events",
            json!({
                "business_id": business_id,
                "owner_id": auth_user.id,
                "title": security::sanitize_text(title, 160),
                "description": security::sanitize_text(description, 1000),
                "start_time": start_time,
                "end_time": end_time,
                "image_url": image_url,
                "created_at": Utc::now().to_rfc3339(),
                "updated_at": Utc::now().to_rfc3339(),
            }),
        )
        .await?;

    insert_activity(
        &state,
        json!({
            "activity_type": "event_created",
            "user_id": auth_user.id,
            "user_name": auth_user.email,
            "business_id": business_id,
            "business_name": value_str(&business, "name"),
            "business_category": value_str(&business, "category"),
            "title": format!("{} created an event", value_str(&business, "name")),
            "description": security::sanitize_text(title, 160),
            "likes": 0,
            "comments": 0,
            "liked_by": [],
            "created_at": Utc::now().to_rfc3339(),
        }),
    )
    .await
    .ok();

    Ok((StatusCode::CREATED, Json(normalize_id_alias(event))))
}

async fn create_business_activity_post(
    state: &AppState,
    auth_user: &AuthUser,
    payload: Value,
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

    let business = find_business(state, business_id).await?;
    ensure_business_owner(&business, auth_user)?;

    let item = insert_activity(
        state,
        json!({
            "activity_type": "owner_post",
            "user_id": auth_user.id,
            "user_name": auth_user.email,
            "business_id": business_id,
            "business_name": value_str(&business, "name"),
            "business_category": value_str(&business, "category"),
            "title": format!("Update from {}", value_str(&business, "name")),
            "description": content,
            "image_url": image_url,
            "likes": 0,
            "comments": 0,
            "liked_by": [],
            "created_at": Utc::now().to_rfc3339(),
        }),
    )
    .await?;

    Ok((StatusCode::CREATED, Json(normalize_activity_item(item))))
}

async fn credibility_response(state: &AppState, user_id: &str) -> Result<Value> {
    let checkins = state
        .db
        .supabase
        .select_json("checkins", &[select_all(), eq("user_id", user_id)])
        .await?;
    let reviews = state
        .db
        .supabase
        .select_json("reviews", &[select_all(), eq("user_id", user_id)])
        .await?;

    let total_checkins = checkins.len() as i32;
    let verified_checkins = checkins
        .iter()
        .filter(|row| {
            value_str(row, "status") == "geo_verified"
                || row["is_geo_verified"].as_bool() == Some(true)
        })
        .count() as i32;
    let total_reviews = reviews.len() as i32;
    let score =
        crate::models::activity::calculate_credibility_score(verified_checkins, total_reviews, 0);
    let tier = crate::models::activity::credibility_tier(score);

    Ok(json!({
        "user_id": user_id,
        "score": score,
        "credibility_score": score,
        "tier": tier,
        "check_in_count": total_checkins,
        "review_count": total_reviews,
        "total_checkins": total_checkins,
        "verified_checkins": verified_checkins,
        "total_reviews": total_reviews,
        "helpful_votes": 0,
        "confirmations_given": 0,
        "confirmations_received": 0,
        "events_attended": 0,
        "is_verified_local": verified_checkins > 0,
    }))
}

async fn find_business(state: &AppState, id: &str) -> Result<Value> {
    state
        .db
        .supabase
        .select_one_json("businesses", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))
}

async fn find_activity(state: &AppState, id: &str) -> Result<Value> {
    state
        .db
        .supabase
        .select_one_json("activity_feed", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Activity not found".into()))
}

async fn insert_activity(state: &AppState, body: Value) -> Result<Value> {
    Ok(state.db.supabase.insert_json("activity_feed", body).await?)
}

fn ensure_business_owner(row: &Value, auth_user: &AuthUser) -> Result<()> {
    if value_str(row, "owner_id") != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }
    Ok(())
}

fn normalize_activity_item(mut row: Value) -> Value {
    row = normalize_id_alias(row);
    let liked_by = row["liked_by"].as_array().cloned().unwrap_or_default();
    if row.get("likes").is_none() {
        row["likes"] = json!(liked_by.len());
    }
    if row.get("comments").is_none() {
        row["comments"] = row.get("comment_count").cloned().unwrap_or(json!(0));
    }
    if row.get("business_name").is_none() {
        row["business_name"] = json!("Community");
    }
    if row.get("title").is_none() {
        row["title"] = json!(value_str(&row, "activity_type").replace('_', " "));
    }
    row
}

fn normalize_comment(mut row: Value) -> Value {
    row = normalize_id_alias(row);
    if row.get("user_name").is_none() {
        row["user_name"] = json!("Anonymous");
    }
    row
}

fn normalize_checkin(mut row: Value) -> Value {
    row = normalize_id_alias(row);
    if row.get("latitude").is_none() {
        row["latitude"] = row.get("lat").cloned().unwrap_or(Value::Null);
    }
    if row.get("longitude").is_none() {
        row["longitude"] = row.get("lng").cloned().unwrap_or(Value::Null);
    }
    if row.get("confirmations").is_none() {
        row["confirmations"] = json!(0);
    }
    if row.get("confirmed_by").is_none() {
        row["confirmed_by"] = json!([]);
    }
    row
}

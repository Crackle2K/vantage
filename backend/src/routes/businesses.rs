use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    models::business::{BusinessCreate, BusinessSearchQuery, BusinessUpdate},
    routes::support::{
        business_lat_lng, eq, ilike_or_filter, is_true, limit, normalize_business, offset, order,
        select_all, value_str, QueryParams,
    },
    security,
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde_json::{json, Map, Value};
use std::sync::Arc;
use validator::Validate;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/businesses", get(list_businesses).post(create_business))
        .route("/businesses/nearby", get(nearby_businesses))
        .route(
            "/businesses/:id/profile",
            axum::routing::put(update_business_profile),
        )
        .route(
            "/businesses/:id",
            get(get_business)
                .put(update_business)
                .delete(delete_business),
        )
        .route("/businesses/:id/photo", get(get_business_photo))
        .route("/photos", get(get_google_place_photo))
}

async fn list_businesses(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BusinessSearchQuery>,
) -> Result<impl IntoResponse> {
    let rows = query_businesses(&state, &params, params.limit.unwrap_or(100).clamp(1, 200)).await?;
    Ok(Json(rows))
}

async fn nearby_businesses(
    State(state): State<Arc<AppState>>,
    Query(mut params): Query<BusinessSearchQuery>,
) -> Result<impl IntoResponse> {
    params.sort = Some("distance".into());
    let rows = query_businesses(&state, &params, params.limit.unwrap_or(50).clamp(1, 100)).await?;
    Ok(Json(rows))
}

async fn get_business(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let id = security::validate_uuid_id(&id, "business ID")?;
    let row = find_business(&state, &id).await?;
    Ok(Json(normalize_business(row)))
}

async fn create_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<BusinessCreate>,
) -> Result<impl IntoResponse> {
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        security::validate_lat_lng(lat, lng)?;
    }
    let website = security::normalize_url(payload.website.as_deref(), 500, false)?;
    let now = Utc::now().to_rfc3339();

    let mut body = Map::new();
    body.insert(
        "name".into(),
        json!(security::sanitize_text(&payload.name, 200)),
    );
    body.insert(
        "address".into(),
        json!(security::sanitize_text(&payload.address, 300)),
    );
    body.insert("is_verified".into(), json!(false));
    body.insert("is_claimed".into(), json!(false));
    body.insert("owner_id".into(), json!(auth_user.id));
    body.insert("review_count".into(), json!(0));
    body.insert("photos".into(), json!([]));
    body.insert("known_for".into(), json!([]));
    body.insert("created_at".into(), json!(now));
    body.insert("updated_at".into(), json!(now));

    insert_optional_text(&mut body, "category", payload.category.as_deref(), 80);
    insert_optional_text(&mut body, "city", payload.city.as_deref(), 120);
    insert_optional_text(&mut body, "state", payload.state.as_deref(), 80);
    insert_optional_text(&mut body, "zip_code", payload.zip_code.as_deref(), 20);
    insert_optional_text(&mut body, "phone", payload.phone.as_deref(), 40);
    insert_optional_text(
        &mut body,
        "description",
        payload.description.as_deref(),
        1000,
    );
    if let Some(website) = website {
        body.insert("website".into(), json!(website));
    }
    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        body.insert(
            "location".into(),
            json!({ "type": "Point", "coordinates": [lng, lat] }),
        );
    }

    let created = state
        .db
        .supabase
        .insert_json("businesses", Value::Object(body))
        .await?;

    Ok((StatusCode::CREATED, Json(normalize_business(created))))
}

async fn update_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<BusinessUpdate>,
) -> Result<impl IntoResponse> {
    let id = security::validate_uuid_id(&id, "business ID")?;
    let existing = find_business(&state, &id).await?;
    ensure_business_owner(&existing, &auth_user)?;

    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        security::validate_lat_lng(lat, lng)?;
    }
    let website = security::normalize_url(payload.website.as_deref(), 500, false)?;

    let mut body = Map::new();
    body.insert("updated_at".into(), json!(Utc::now().to_rfc3339()));
    insert_optional_text(&mut body, "name", payload.name.as_deref(), 200);
    insert_optional_text(&mut body, "category", payload.category.as_deref(), 80);
    insert_optional_text(&mut body, "address", payload.address.as_deref(), 300);
    insert_optional_text(&mut body, "city", payload.city.as_deref(), 120);
    insert_optional_text(&mut body, "state", payload.state.as_deref(), 80);
    insert_optional_text(&mut body, "zip_code", payload.zip_code.as_deref(), 20);
    insert_optional_text(&mut body, "phone", payload.phone.as_deref(), 40);
    insert_optional_text(
        &mut body,
        "description",
        payload.description.as_deref(),
        1000,
    );
    if let Some(website) = website {
        body.insert("website".into(), json!(website));
    }
    if let Some(hours) = payload.hours {
        body.insert(
            "hours".into(),
            serde_json::to_value(hours).unwrap_or(Value::Null),
        );
    }
    if let (Some(lat), Some(lng)) = (payload.lat, payload.lng) {
        body.insert(
            "location".into(),
            json!({ "type": "Point", "coordinates": [lng, lat] }),
        );
    }

    let updated = state
        .db
        .supabase
        .update_json("businesses", &[eq("id", &id)], Value::Object(body))
        .await?;

    let row = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    Ok(Json(normalize_business(row)))
}

async fn update_business_profile(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse> {
    let id = security::validate_uuid_id(&id, "business ID")?;
    let existing = find_business(&state, &id).await?;
    ensure_business_owner(&existing, &auth_user)?;

    let mut body = Map::new();
    body.insert("updated_at".into(), json!(Utc::now().to_rfc3339()));

    if let Some(desc) = payload["short_description"].as_str() {
        let cleaned = security::sanitize_text(desc, 500);
        body.insert("short_description".into(), json!(cleaned.clone()));
        body.insert("description".into(), json!(cleaned));
    }

    if let Some(items) = payload["known_for"].as_array() {
        let known_for = items
            .iter()
            .filter_map(Value::as_str)
            .filter_map(|value| security::sanitize_optional_text(Some(value), 60))
            .take(12)
            .collect::<Vec<_>>();
        body.insert("known_for".into(), json!(known_for));
    }

    let updated = state
        .db
        .supabase
        .update_json("businesses", &[eq("id", &id)], Value::Object(body))
        .await?;
    let row = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;
    Ok(Json(normalize_business(row)))
}

async fn delete_business(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let id = security::validate_uuid_id(&id, "business ID")?;
    let existing = find_business(&state, &id).await?;
    ensure_business_owner(&existing, &auth_user)?;

    state
        .db
        .supabase
        .delete_json("businesses", &[eq("id", &id)])
        .await?;

    Ok(Json(json!({ "message": "Business deleted" })))
}

async fn get_business_photo(
    State(state): State<Arc<AppState>>,
    Path(_id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Response> {
    let photo_ref = params
        .get("ref")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("Missing photo ref".into()))?;
    proxy_google_photo(&state, &photo_ref, &params).await
}

async fn get_google_place_photo(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Response> {
    let place_id = params
        .get("place_id")
        .map(|value| security::sanitize_text(value, 180))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("Missing place_id".into()))?;

    if state.config.google_api_key.is_empty() {
        return Err(AppError::BadRequest("Google API not configured".into()));
    }

    let details =
        crate::services::google_places::get_place_details(&state.config.google_api_key, &place_id)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
    let photo_ref = details["photos"]
        .as_array()
        .and_then(|photos| photos.first())
        .and_then(|photo| photo["photo_reference"].as_str())
        .ok_or_else(|| AppError::NotFound("Photo not found".into()))?;

    proxy_google_photo(&state, photo_ref, &params).await
}

async fn proxy_google_photo(
    state: &AppState,
    photo_ref: &str,
    params: &std::collections::HashMap<String, String>,
) -> Result<Response> {
    let photo_ref = security::validate_photo_reference(photo_ref)?;

    if state.config.google_api_key.is_empty() {
        return Err(AppError::BadRequest("Google API not configured".into()));
    }

    let max_width = params
        .get("maxwidth")
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(800)
        .clamp(64, 1600);

    let url = crate::services::google_places::get_photo_url(
        &state.config.google_api_key,
        &photo_ref,
        max_width,
    )
    .await;

    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if !response.status().is_success() {
        return Err(AppError::BadRequest("Photo is unavailable".into()));
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("image/jpeg"));
    let body: Bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=86400"),
            ),
        ],
        body,
    )
        .into_response())
}

async fn query_businesses(
    state: &AppState,
    params: &BusinessSearchQuery,
    limit_value: i64,
) -> Result<Vec<Value>> {
    if let (Some(lat), Some(lng)) = (params.lat, params.lng) {
        security::validate_lat_lng(lat, lng)?;
    }

    let mut query: QueryParams = vec![
        select_all(),
        limit(if params.lat.is_some() && params.lng.is_some() {
            limit_value * 3
        } else {
            limit_value
        }),
        offset(params.offset.unwrap_or(0)),
    ];

    if let Some(category) = params.category.as_ref().filter(|value| !value.is_empty()) {
        query.push(eq("category", security::sanitize_text(category, 80)));
    }
    if let Some(owner_id) = params.owner_id.as_ref().filter(|value| !value.is_empty()) {
        query.push(eq(
            "owner_id",
            security::validate_uuid_id(owner_id, "owner ID")?,
        ));
    }
    if params.verified_only.unwrap_or(false) {
        query.push(is_true("is_verified"));
    }
    if let Some(search) = params
        .q
        .as_deref()
        .or(params.search.as_deref())
        .filter(|value| !value.trim().is_empty())
    {
        if let Some(filter) = ilike_or_filter(&["name", "description", "category"], search) {
            query.push(filter);
        }
    }

    let sort = params.sort.as_deref().or(params.sort_by.as_deref());
    match sort {
        Some("rating") => query.push(order("rating.desc.nullslast,review_count.desc")),
        Some("newest") => query.push(order("created_at.desc")),
        Some("name") => query.push(order("name.asc")),
        _ => query.push(order("created_at.desc")),
    }

    let rows = state.db.supabase.select_json("businesses", &query).await?;
    let mut businesses = rows
        .into_iter()
        .map(normalize_business)
        .filter_map(|mut row| {
            if let (Some(user_lat), Some(user_lng)) = (params.lat, params.lng) {
                let (lat, lng) = business_lat_lng(&row)?;
                let radius = params.radius_km.or(params.radius).unwrap_or(25.0);
                let distance =
                    crate::services::geo_service::haversine_km(user_lat, user_lng, lat, lng);
                if distance > radius {
                    return None;
                }
                row["distance"] = json!(distance);
                row["distance_km"] = json!(distance);
            }
            Some(row)
        })
        .collect::<Vec<_>>();

    match sort {
        Some("distance") => businesses.sort_by(|a, b| {
            a["distance_km"]
                .as_f64()
                .unwrap_or(f64::MAX)
                .partial_cmp(&b["distance_km"].as_f64().unwrap_or(f64::MAX))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        Some("rating") => businesses.sort_by(|a, b| {
            b["rating"]
                .as_f64()
                .unwrap_or(0.0)
                .partial_cmp(&a["rating"].as_f64().unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        _ => {}
    }

    businesses.truncate(limit_value as usize);
    Ok(businesses)
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
    let owner_id = value_str(row, "owner_id");
    if owner_id != auth_user.id && auth_user.role != "admin" {
        return Err(AppError::Forbidden("Not the business owner".into()));
    }
    Ok(())
}

fn insert_optional_text(body: &mut Map<String, Value>, key: &str, value: Option<&str>, max: usize) {
    if let Some(value) = value.and_then(|raw| security::sanitize_optional_text(Some(raw), max)) {
        body.insert(key.into(), json!(value));
    }
}

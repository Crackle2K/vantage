use crate::{
    errors::{AppError, Result},
    security,
    state::AppState,
};
use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/location/reverse", get(reverse_geocode))
}

#[derive(Deserialize)]
struct ReverseGeoParams {
    lat: f64,
    lng: f64,
}

async fn reverse_geocode(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ReverseGeoParams>,
) -> Result<impl IntoResponse> {
    security::validate_lat_lng(params.lat, params.lng)?;

    if state.config.google_api_key.is_empty() {
        let label = format!("{:.4}, {:.4}", params.lat, params.lng);
        return Ok(Json(json!({
            "formatted_address": label,
            "city": null,
            "state": null,
            "region": null,
            "label": label,
        })));
    }

    let url = format!(
        "https://maps.googleapis.com/maps/api/geocode/json?latlng={},{}&key={}",
        params.lat, params.lng, state.config.google_api_key
    );

    let resp: Value = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let results = resp["results"].as_array().cloned().unwrap_or_default();
    if results.is_empty() {
        return Ok(Json(
            json!({ "formatted_address": null, "city": null, "state": null, "region": null, "label": format!("{:.4}, {:.4}", params.lat, params.lng) }),
        ));
    }

    let result = &results[0];
    let formatted = result["formatted_address"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let components = result["address_components"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let city = find_component(&components, "locality");
    let state_name = find_component(&components, "administrative_area_level_1");
    let label = match (&city, &state_name) {
        (Some(city), Some(region)) => format!("{}, {}", city, region),
        (Some(city), None) => city.clone(),
        (None, Some(region)) => region.clone(),
        (None, None) => formatted.clone(),
    };

    Ok(Json(json!({
        "formatted_address": formatted,
        "city": city,
        "state": state_name,
        "region": state_name,
        "label": label,
        "lat": params.lat,
        "lng": params.lng,
    })))
}

fn find_component(components: &[Value], component_type: &str) -> Option<String> {
    components.iter().find_map(|c| {
        let types = c["types"].as_array()?;
        if types.iter().any(|t| t.as_str() == Some(component_type)) {
            c["long_name"].as_str().map(String::from)
        } else {
            None
        }
    })
}

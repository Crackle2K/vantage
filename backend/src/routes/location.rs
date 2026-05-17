use crate::{
    errors::{AppError, Result},
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
    if state.config.google_api_key.is_empty() {
        return Ok(Json(json!({
            "formatted_address": format!("{:.4}, {:.4}", params.lat, params.lng),
            "city": null,
            "state": null,
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
            json!({ "formatted_address": null, "city": null, "state": null }),
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

    Ok(Json(json!({
        "formatted_address": formatted,
        "city": city,
        "state": state_name,
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

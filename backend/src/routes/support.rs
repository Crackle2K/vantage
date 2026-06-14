use crate::{errors::AppError, errors::Result};
use axum::http::{HeaderMap, HeaderValue};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Serialize;
use serde_json::{json, Value};

pub type QueryParams = Vec<(String, String)>;
const CURSOR_PREFIX: &str = "offset:";

pub fn q(key: impl Into<String>, value: impl Into<String>) -> (String, String) {
    (key.into(), value.into())
}

pub fn eq(column: &str, value: impl ToString) -> (String, String) {
    q(column, format!("eq.{}", value.to_string()))
}

pub fn gte(column: &str, value: impl ToString) -> (String, String) {
    q(column, format!("gte.{}", value.to_string()))
}

pub fn is_true(column: &str) -> (String, String) {
    q(column, "eq.true")
}

pub fn select_all() -> (String, String) {
    q("select", "*")
}

pub fn limit(value: i64) -> (String, String) {
    q("limit", value.max(0).to_string())
}

pub fn offset(value: i64) -> (String, String) {
    q("offset", value.max(0).to_string())
}

pub fn order(value: &str) -> (String, String) {
    q("order", value)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PaginationMeta {
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
    pub next_offset: Option<i64>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaginationWindow {
    pub limit: i64,
    pub offset: i64,
}

pub fn pagination_window(
    limit_value: Option<i64>,
    offset_value: Option<i64>,
    cursor_value: Option<&str>,
    default_limit: i64,
    max_limit: i64,
) -> Result<PaginationWindow> {
    let limit = limit_value.unwrap_or(default_limit).clamp(1, max_limit);
    let offset_from_cursor = cursor_value
        .filter(|value| !value.trim().is_empty())
        .map(decode_offset_cursor)
        .transpose()?;
    let offset = offset_from_cursor.or(offset_value).unwrap_or(0).max(0);

    Ok(PaginationWindow { limit, offset })
}

pub fn pagination_meta(limit: i64, offset: i64, fetched_count: usize) -> PaginationMeta {
    let has_more = fetched_count > limit as usize;
    let next_offset = has_more.then_some(offset + limit);
    let next_cursor = next_offset.map(encode_offset_cursor);

    PaginationMeta {
        limit,
        offset,
        has_more,
        next_offset,
        next_cursor,
    }
}

pub fn pagination_headers(meta: &PaginationMeta) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-page-limit",
        HeaderValue::from_str(&meta.limit.to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    headers.insert(
        "x-page-offset",
        HeaderValue::from_str(&meta.offset.to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    headers.insert(
        "x-has-more",
        HeaderValue::from_static(if meta.has_more { "true" } else { "false" }),
    );
    if let Some(cursor) = &meta.next_cursor {
        if let Ok(value) = HeaderValue::from_str(cursor) {
            headers.insert("x-next-cursor", value);
        }
    }
    headers
}

fn encode_offset_cursor(offset: i64) -> String {
    URL_SAFE_NO_PAD.encode(format!("{}{}", CURSOR_PREFIX, offset.max(0)))
}

fn decode_offset_cursor(cursor: &str) -> Result<i64> {
    let decoded = URL_SAFE_NO_PAD
        .decode(cursor.trim())
        .map_err(|_| AppError::BadRequest("Invalid pagination cursor".into()))?;
    let decoded = String::from_utf8(decoded)
        .map_err(|_| AppError::BadRequest("Invalid pagination cursor".into()))?;
    let offset = decoded
        .strip_prefix(CURSOR_PREFIX)
        .ok_or_else(|| AppError::BadRequest("Invalid pagination cursor".into()))?
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("Invalid pagination cursor".into()))?;
    Ok(offset.max(0))
}

pub fn ilike_or_filter(columns: &[&str], raw: &str) -> Option<(String, String)> {
    let term = sanitize_postgrest_pattern(raw);
    if term.is_empty() {
        return None;
    }

    let clauses = columns
        .iter()
        .map(|column| format!("{}.ilike.*{}*", column, term))
        .collect::<Vec<_>>()
        .join(",");
    Some(q("or", format!("({})", clauses)))
}

pub fn normalize_id_alias(mut row: Value) -> Value {
    if let Some(id) = row.get("id").cloned() {
        row["_id"] = id;
    }
    row
}

pub fn unwrap_rpc_items(rows: Vec<Value>) -> Vec<Value> {
    rows.into_iter()
        .map(|row| row.get("item").cloned().unwrap_or(row))
        .collect()
}

pub fn geo_rpc_unavailable(message: &str) -> bool {
    let lowered = message.to_ascii_lowercase();
    lowered.contains("search_businesses_geo")
        || lowered.contains("activity_pulse_geo")
        || lowered.contains("owner_events_geo")
        || lowered.contains("could not find the function")
        || lowered.contains("schema cache")
        || lowered.contains("postgis")
        || lowered.contains("location_geog")
}

pub fn normalize_business(mut row: Value) -> Value {
    row = normalize_id_alias(row);

    if row.get("place_id").is_none() {
        if let Some(place_id) = row.get("google_place_id").cloned() {
            row["place_id"] = place_id;
        }
    }
    if row.get("live_visibility_score").is_none() {
        if let Some(score) = row.get("visibility_score").cloned() {
            row["live_visibility_score"] = score;
        }
    }
    if row.get("has_deals").is_none() {
        row["has_deals"] = json!(false);
    }
    if row.get("description").is_none() {
        row["description"] = json!("");
    }
    if row.get("rating").is_none() {
        row["rating"] = json!(0);
    }
    if row.get("review_count").is_none() {
        row["review_count"] = json!(0);
    }

    row
}

pub fn normalize_review(mut row: Value) -> Value {
    row = normalize_id_alias(row);
    if row.get("verified").is_none() {
        row["verified"] = row.get("is_verified").cloned().unwrap_or(json!(false));
    }
    if row.get("comment").is_none() {
        row["comment"] = json!("");
    }
    if row.get("user_name").is_none() {
        row["user_name"] = json!("Vantage user");
    }
    row
}

pub fn normalize_deal(mut row: Value) -> Value {
    row = normalize_id_alias(row);
    if row.get("discount_type").is_none() {
        row["discount_type"] = json!("percentage");
    }
    if row.get("discount_value").is_none() {
        row["discount_value"] = row
            .get("discount_percent")
            .cloned()
            .unwrap_or_else(|| json!(0));
    }
    if row.get("description").is_none() {
        row["description"] = json!("");
    }
    row
}

pub fn value_str<'a>(row: &'a Value, key: &str) -> &'a str {
    row.get(key).and_then(Value::as_str).unwrap_or("")
}

pub fn value_i64(row: &Value, key: &str) -> i64 {
    row.get(key).and_then(Value::as_i64).unwrap_or(0)
}

pub fn value_f64(row: &Value, key: &str) -> f64 {
    row.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

pub fn value_bool(row: &Value, key: &str) -> bool {
    row.get(key).and_then(Value::as_bool).unwrap_or(false)
}

pub fn business_lat_lng(row: &Value) -> Option<(f64, f64)> {
    let coords = row.get("location")?.get("coordinates")?.as_array()?;
    if coords.len() != 2 {
        return None;
    }
    let lng = coords.first()?.as_f64()?;
    let lat = coords.get(1)?.as_f64()?;
    Some((lat, lng))
}

pub fn sanitize_postgrest_pattern(raw: &str) -> String {
    raw.chars()
        .filter(|ch| !matches!(ch, '*' | '%' | ',' | '(' | ')' | '"' | '\''))
        .take(120)
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unwrap_rpc_items_extracts_item_payloads_and_keeps_plain_rows() {
        let rows = unwrap_rpc_items(vec![
            json!({ "item": { "id": "inside" } }),
            json!({ "id": "plain" }),
        ]);

        assert_eq!(rows[0]["id"], "inside");
        assert_eq!(rows[1]["id"], "plain");
    }

    #[test]
    fn geo_rpc_unavailable_detects_missing_geo_migration_errors() {
        assert!(geo_rpc_unavailable(
            "Could not find the function public.search_businesses_geo in the schema cache"
        ));
        assert!(geo_rpc_unavailable(
            "column businesses.location_geog does not exist"
        ));
        assert!(!geo_rpc_unavailable(
            "permission denied for table businesses"
        ));
    }

    #[test]
    fn pagination_cursor_round_trips_offset_and_rejects_bad_values() {
        let meta = pagination_meta(20, 40, 21);
        assert!(meta.has_more);
        assert_eq!(meta.next_offset, Some(60));

        let window = pagination_window(None, None, meta.next_cursor.as_deref(), 10, 50).unwrap();
        assert_eq!(window.limit, 10);
        assert_eq!(window.offset, 60);

        assert!(pagination_window(None, None, Some("not-a-cursor"), 10, 50).is_err());
    }
}

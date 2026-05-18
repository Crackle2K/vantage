use serde_json::{json, Value};

pub type QueryParams = Vec<(String, String)>;

pub fn q(key: impl Into<String>, value: impl Into<String>) -> (String, String) {
    (key.into(), value.into())
}

pub fn eq(column: &str, value: impl ToString) -> (String, String) {
    q(column, format!("eq.{}", value.to_string()))
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

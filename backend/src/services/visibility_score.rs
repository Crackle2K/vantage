use serde_json::Value;

/// Compute a visibility score (0-100) for a business row.
///
/// Signals used (matching the Python implementation):
/// - Average rating (0-5) weighted by review count
/// - Review count (log-scaled)
/// - Whether the business is verified
/// - Stored visibility_score override (if already computed externally)
///
/// Business claiming is intentionally excluded from the score. Ranking is
/// earned by activity and credibility, never by ownership status.
pub fn compute(row: &Value) -> f64 {
    // Use stored score if available
    if let Some(stored) = row.get("visibility_score").and_then(Value::as_f64) {
        if stored > 0.0 {
            return stored;
        }
    }

    let mut score: f64 = 0.0;

    // Rating signal (0-40 points)
    if let Some(rating) = row.get("rating").and_then(Value::as_f64) {
        let review_count = row.get("review_count").and_then(Value::as_i64).unwrap_or(0) as f64;
        let confidence = review_count / (review_count + 10.0); // Wilson-style dampening
        score += rating * 8.0 * confidence;
    }

    // Review volume signal (0-20 points, log-scaled)
    let review_count = row.get("review_count").and_then(Value::as_i64).unwrap_or(0) as f64;
    if review_count > 0.0 {
        score += (review_count.ln() / 5_f64.ln()) * 20.0;
    }

    // Verified status (0-20 points)
    if row
        .get("is_verified")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        score += 20.0;
    }

    // Has description (0-5 points)
    if row
        .get("description")
        .and_then(Value::as_str)
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        score += 5.0;
    }

    // Has photos (0-5 points)
    if let Some(photos) = row.get("photos").and_then(Value::as_array) {
        if !photos.is_empty() {
            score += 5.0;
        }
    }

    score.clamp(0.0, 100.0)
}

/// Compute a match score for query relevance (0–1).
pub fn match_score(row: &Value, query: &str) -> f64 {
    if query.is_empty() {
        return 1.0;
    }

    let q = query.to_lowercase();
    let mut score: f64 = 0.0;

    // Name match (strongest signal)
    if let Some(name) = row.get("name").and_then(Value::as_str) {
        let name_lower = name.to_lowercase();
        if name_lower == q {
            score += 1.0;
        } else if name_lower.starts_with(&q) {
            score += 0.8;
        } else if name_lower.contains(&q) {
            score += 0.6;
        }
    }

    // Category match
    if let Some(cat) = row.get("category").and_then(Value::as_str) {
        if cat.to_lowercase().contains(&q) {
            score += 0.4;
        }
    }

    // Description match
    if let Some(desc) = row.get("description").and_then(Value::as_str) {
        if desc.to_lowercase().contains(&q) {
            score += 0.2;
        }
    }

    score.min(1.0)
}

#[cfg(test)]
mod tests {
    use super::compute;
    use serde_json::json;

    #[test]
    fn claimed_status_does_not_change_visibility_score() {
        let mut unclaimed = json!({
            "rating": 4.8,
            "review_count": 28,
            "is_verified": true,
            "description": "Independent neighborhood cafe",
        });
        let mut claimed = unclaimed.clone();
        unclaimed["is_claimed"] = json!(false);
        claimed["is_claimed"] = json!(true);

        assert_eq!(compute(&unclaimed), compute(&claimed));
    }

    #[test]
    fn monetization_and_customer_action_metadata_do_not_change_visibility_score() {
        let baseline = json!({
            "rating": 4.6,
            "review_count": 42,
            "is_verified": true,
            "description": "Independent restaurant with recent local activity",
            "photos": ["front.jpg"],
        });
        let with_non_ranking_metadata = json!({
            "rating": 4.6,
            "review_count": 42,
            "is_verified": true,
            "description": "Independent restaurant with recent local activity",
            "photos": ["front.jpg"],
            "subscription_tier": "premium",
            "visibility_boost": true,
            "featured_placement": true,
            "sponsored": true,
            "has_deals": true,
            "active_offer_claims": 18,
            "customer_event_count": 240,
            "affects_lvs": false
        });

        assert_eq!(compute(&baseline), compute(&with_non_ranking_metadata));
    }
}

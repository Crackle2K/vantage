use mongodb::bson::Document;

/// Compute a visibility score (0–100) for a business document.
///
/// Signals used (matching the Python implementation):
/// - Average rating (0-5) weighted by review count
/// - Review count (log-scaled)
/// - Whether the business is verified
/// - Stored visibility_score override (if already computed externally)
pub fn compute(doc: &Document) -> f64 {
    // Use stored score if available
    if let Ok(stored) = doc.get_f64("visibility_score") {
        if stored > 0.0 {
            return stored;
        }
    }

    let mut score: f64 = 0.0;

    // Rating signal (0-40 points)
    if let Ok(rating) = doc.get_f64("rating") {
        let review_count = doc.get_i32("review_count").unwrap_or(0) as f64;
        let confidence = review_count / (review_count + 10.0); // Wilson-style dampening
        score += rating * 8.0 * confidence;
    }

    // Review volume signal (0-20 points, log-scaled)
    let review_count = doc.get_i32("review_count").unwrap_or(0) as f64;
    if review_count > 0.0 {
        score += (review_count.ln() / 5_f64.ln()) * 20.0;
    }

    // Verified status (0-20 points)
    if doc.get_bool("is_verified").unwrap_or(false) {
        score += 20.0;
    }

    // Has description (0-5 points)
    if doc
        .get_str("description")
        .map(|s| !s.is_empty())
        .unwrap_or(false)
    {
        score += 5.0;
    }

    // Has photos (0-5 points)
    if let Ok(photos) = doc.get_array("photos") {
        if !photos.is_empty() {
            score += 5.0;
        }
    }

    score.clamp(0.0, 100.0)
}

/// Compute a match score for query relevance (0–1).
pub fn match_score(doc: &Document, query: &str) -> f64 {
    if query.is_empty() {
        return 1.0;
    }

    let q = query.to_lowercase();
    let mut score: f64 = 0.0;

    // Name match (strongest signal)
    if let Ok(name) = doc.get_str("name") {
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
    if let Ok(cat) = doc.get_str("category") {
        if cat.to_lowercase().contains(&q) {
            score += 0.4;
        }
    }

    // Description match
    if let Ok(desc) = doc.get_str("description") {
        if desc.to_lowercase().contains(&q) {
            score += 0.2;
        }
    }

    score.min(1.0)
}

#[cfg(test)]
mod tests {
    use super::compute;
    use mongodb::bson::doc;

    #[test]
    fn claimed_status_does_not_change_visibility_score() {
        let mut unclaimed = doc! {
            "rating": 4.8,
            "review_count": 28,
            "is_verified": true,
            "description": "Independent neighborhood cafe",
        };
        let mut claimed = unclaimed.clone();
        unclaimed.insert("is_claimed", false);
        claimed.insert("is_claimed", true);

        assert_eq!(compute(&unclaimed), compute(&claimed));
    }
}

use crate::{
    errors::{AppError, Result},
    models::user::UserPreferencesUpdate,
};
use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::Url;
use serde_json::json;
use std::{
    collections::{HashMap, VecDeque},
    net::IpAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

static HTML_TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<[^>]*>").unwrap());
static CONTROL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]").unwrap());
static PHOTO_REF_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[A-Za-z0-9_\-\.]+$").unwrap());

#[derive(Clone, Default)]
pub struct RateLimiter {
    buckets: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn check(&self, key: &str, limit: u32, window: Duration) -> bool {
        if limit == 0 {
            return false;
        }

        let now = Instant::now();
        let cutoff = now.checked_sub(window).unwrap_or(now);
        let mut buckets = self.buckets.lock().await;

        if buckets.len() > 10_000 {
            buckets.retain(|_, timestamps| timestamps.back().is_some_and(|last| *last >= cutoff));
        }

        let timestamps = buckets.entry(key.to_string()).or_default();
        while timestamps.front().is_some_and(|instant| *instant < cutoff) {
            timestamps.pop_front();
        }

        if timestamps.len() >= limit as usize {
            return false;
        }

        timestamps.push_back(now);
        true
    }
}

pub fn sanitize_text(value: &str, max_len: usize) -> String {
    let without_tags = HTML_TAG_RE.replace_all(value, " ");
    let without_controls = CONTROL_RE.replace_all(&without_tags, "");
    let normalized = without_controls
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    truncate_chars(&normalized, max_len)
}

pub fn sanitize_optional_text(value: Option<&str>, max_len: usize) -> Option<String> {
    value
        .map(|raw| sanitize_text(raw, max_len))
        .filter(|cleaned| !cleaned.is_empty())
}

pub fn safe_regex_literal(value: &str, max_len: usize) -> String {
    regex::escape(&sanitize_text(value, max_len))
}

pub fn normalize_url(
    value: Option<&str>,
    max_len: usize,
    require_https: bool,
) -> Result<Option<String>> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let cleaned = sanitize_text(raw, max_len);
    if cleaned.is_empty() {
        return Ok(None);
    }

    let parsed = Url::parse(&cleaned).map_err(|_| AppError::BadRequest("Invalid URL".into()))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::BadRequest("URL must use http or https".into()));
    }
    if require_https && scheme != "https" {
        return Err(AppError::BadRequest("URL must use https".into()));
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err(AppError::BadRequest(
            "URL must not include credentials".into(),
        ));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::BadRequest("URL must include a host".into()))?;
    if !host_is_public(host) {
        return Err(AppError::BadRequest("URL host is not allowed".into()));
    }

    Ok(Some(parsed.to_string()))
}

pub fn validate_photo_reference(value: &str) -> Result<String> {
    let cleaned = sanitize_text(value, 512);
    if cleaned.is_empty() || cleaned.len() > 512 || !PHOTO_REF_RE.is_match(&cleaned) {
        return Err(AppError::BadRequest("Invalid photo reference".into()));
    }
    Ok(cleaned)
}

pub fn validate_lat_lng(lat: f64, lng: f64) -> Result<()> {
    if !lat.is_finite()
        || !lng.is_finite()
        || !(-90.0..=90.0).contains(&lat)
        || !(-180.0..=180.0).contains(&lng)
    {
        return Err(AppError::BadRequest("Invalid coordinates".into()));
    }
    Ok(())
}

pub fn validate_password_strength(password: &str) -> Result<()> {
    if password.len() < 8 || password.len() > 128 {
        return Err(AppError::BadRequest(
            "Password must be between 8 and 128 characters".into(),
        ));
    }

    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_symbol = password.chars().any(|c| !c.is_ascii_alphanumeric());
    if [has_lower, has_upper, has_digit, has_symbol]
        .into_iter()
        .filter(|passed| *passed)
        .count()
        < 3
    {
        return Err(AppError::BadRequest(
            "Password must include at least 3 character classes".into(),
        ));
    }

    Ok(())
}

pub fn sanitize_preferences(payload: UserPreferencesUpdate) -> serde_json::Value {
    json!({
        "categories": payload.categories.map(|items| {
            items
                .into_iter()
                .filter_map(|item| sanitize_optional_text(Some(&item), 40))
                .take(20)
                .collect::<Vec<_>>()
        }),
        "price_preference": payload.price_preference,
        "discovery_mode": payload.discovery_mode,
        "max_distance_km": payload.max_distance_km.filter(|distance| distance.is_finite() && *distance > 0.0 && *distance <= 100.0),
        "show_verified_only": payload.show_verified_only,
        "show_open_now": payload.show_open_now,
    })
}

fn host_is_public(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty()
        || normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
    {
        return false;
    }

    match normalized.parse::<IpAddr>() {
        Ok(ip) => match ip {
            IpAddr::V4(ip) => {
                !(ip.is_private()
                    || ip.is_loopback()
                    || ip.is_link_local()
                    || ip.is_broadcast()
                    || ip.is_documentation()
                    || ip.is_unspecified())
            }
            IpAddr::V6(ip) => {
                !(ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local())
            }
        },
        Err(_) => true,
    }
}

fn truncate_chars(value: &str, max_len: usize) -> String {
    value
        .chars()
        .take(max_len)
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_url, sanitize_text, validate_password_strength};

    #[test]
    fn sanitize_text_strips_html_and_control_chars() {
        assert_eq!(
            sanitize_text("<script>x</script>\x00 Hello <b>shop</b>", 40),
            "x Hello shop"
        );
    }

    #[test]
    fn normalize_url_rejects_private_hosts() {
        assert!(normalize_url(Some("javascript:alert(1)"), 200, false).is_err());
        assert!(normalize_url(Some("http://127.0.0.1/admin"), 200, false).is_err());
        assert!(normalize_url(Some("https://example.com"), 200, true).is_ok());
    }

    #[test]
    fn password_strength_requires_complexity() {
        assert!(validate_password_strength("password").is_err());
        assert!(validate_password_strength("Passw0rd!").is_ok());
    }
}

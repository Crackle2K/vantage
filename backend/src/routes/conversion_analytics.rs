use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{eq, order, select_all, value_str},
    security,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/businesses/:id/conversion-summary",
            get(get_conversion_summary),
        )
        .route(
            "/businesses/:id/conversion-timeseries",
            get(get_conversion_timeseries),
        )
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum ConversionRange {
    #[serde(rename = "7d")]
    Days7,
    #[serde(rename = "30d")]
    Days30,
    #[serde(rename = "90d")]
    Days90,
}

impl ConversionRange {
    fn days(self) -> i64 {
        match self {
            Self::Days7 => 7,
            Self::Days30 => 30,
            Self::Days90 => 90,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Days7 => "7d",
            Self::Days30 => "30d",
            Self::Days90 => "90d",
        }
    }
}

impl Default for ConversionRange {
    fn default() -> Self {
        Self::Days30
    }
}

impl<'de> Deserialize<'de> for ConversionRange {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        parse_range(Some(&value)).map_err(serde::de::Error::custom)
    }
}

#[derive(Deserialize)]
struct AnalyticsQuery {
    #[serde(default)]
    range: ConversionRange,
}

#[derive(Deserialize)]
struct TimeseriesQuery {
    #[serde(default)]
    range: ConversionRange,
    #[serde(default = "default_bucket")]
    bucket: String,
}

fn default_bucket() -> String {
    "day".into()
}

#[derive(Default, Debug, Clone, Serialize)]
struct ConversionTotals {
    impressions: i64,
    swipe_left: i64,
    swipe_right: i64,
    saves: i64,
    matches: i64,
    profile_opens: i64,
    offer_claims: i64,
    directions_clicks: i64,
    check_ins: i64,
    redemption_placeholders: i64,
}

#[derive(Default, Debug, Clone, Serialize)]
struct ConversionRates {
    match_rate: f64,
    save_rate: f64,
    profile_open_rate: f64,
    action_rate: f64,
    claim_rate: f64,
    redemption_placeholder_rate: f64,
}

#[derive(Debug, Clone, Serialize)]
struct FunnelStep {
    id: &'static str,
    label: &'static str,
    count: i64,
}

#[derive(Debug, Clone, Serialize)]
struct ReasonCount {
    reason_code: String,
    label: String,
    count: i64,
}

#[derive(Debug, Clone, Serialize)]
struct ConversionSummary {
    business_id: String,
    range: String,
    totals: ConversionTotals,
    rates: ConversionRates,
    funnel: Vec<FunnelStep>,
    top_match_reasons: Vec<ReasonCount>,
    top_skipped_reasons: Vec<ReasonCount>,
}

#[derive(Default, Debug, Clone, Serialize)]
struct TimeseriesBucket {
    date: String,
    impressions: i64,
    saves: i64,
    matches: i64,
    profile_opens: i64,
    offer_claims: i64,
    directions_clicks: i64,
    check_ins: i64,
    redemption_placeholders: i64,
}

#[derive(Debug, Clone, Serialize)]
struct ConversionTimeseries {
    business_id: String,
    range: String,
    bucket: &'static str,
    buckets: Vec<TimeseriesBucket>,
}

async fn get_conversion_summary(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<AnalyticsQuery>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&id, "business ID")?;
    ensure_analytics_access(&state, &business_id, &auth_user).await?;
    let events = fetch_customer_events(&state, &business_id, query.range).await?;

    Ok(Json(build_summary(&business_id, query.range, &events)))
}

async fn get_conversion_timeseries(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<TimeseriesQuery>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    if query.bucket != "day" {
        return Err(AppError::BadRequest("Only bucket=day is supported".into()));
    }

    let business_id = security::validate_uuid_id(&id, "business ID")?;
    ensure_analytics_access(&state, &business_id, &auth_user).await?;
    let events = fetch_customer_events(&state, &business_id, query.range).await?;

    Ok(Json(build_timeseries(&business_id, query.range, &events)))
}

async fn ensure_analytics_access(
    state: &AppState,
    business_id: &str,
    auth_user: &AuthUser,
) -> Result<()> {
    if auth_user.role != "business_owner" && auth_user.role != "admin" {
        return Err(AppError::Forbidden(
            "Business owner account required".into(),
        ));
    }

    let business = state
        .db
        .supabase
        .select_one_json("businesses", &[select_all(), eq("id", business_id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Business not found".into()))?;

    ensure_owner_authorized(value_str(&business, "owner_id"), auth_user)
}

async fn fetch_customer_events(
    state: &AppState,
    business_id: &str,
    range: ConversionRange,
) -> Result<Vec<Value>> {
    let range_start = Utc::now() - Duration::days(range.days());
    state
        .db
        .supabase
        .select_json(
            "customer_events",
            &[
                (
                    "select".into(),
                    "event_type,created_at,match_reason_codes".into(),
                ),
                eq("business_id", business_id),
                ("created_at".into(), format!("gte.{}", range_start.to_rfc3339())),
                order("created_at.asc"),
            ],
        )
        .await
        .map_err(AppError::from)
}

fn parse_range(value: Option<&str>) -> Result<ConversionRange> {
    match value.unwrap_or("30d") {
        "7d" => Ok(ConversionRange::Days7),
        "30d" => Ok(ConversionRange::Days30),
        "90d" => Ok(ConversionRange::Days90),
        _ => Err(AppError::BadRequest(
            "range must be one of 7d, 30d, or 90d".into(),
        )),
    }
}

fn ensure_owner_authorized(owner_id: &str, auth_user: &AuthUser) -> Result<()> {
    if auth_user.role == "admin" || owner_id == auth_user.id {
        return Ok(());
    }

    Err(AppError::Forbidden("Not the business owner".into()))
}

fn build_summary(business_id: &str, range: ConversionRange, rows: &[Value]) -> ConversionSummary {
    let totals = aggregate_totals(rows);
    let actions = totals.offer_claims + totals.directions_clicks + totals.check_ins;
    let positive_intent = totals.saves + totals.matches;
    let rates = ConversionRates {
        match_rate: safe_rate(totals.matches, totals.impressions),
        save_rate: safe_rate(totals.saves, totals.impressions),
        profile_open_rate: safe_rate(totals.profile_opens, totals.impressions),
        action_rate: safe_rate(actions, totals.impressions),
        claim_rate: safe_rate(totals.offer_claims, totals.profile_opens),
        redemption_placeholder_rate: safe_rate(
            totals.redemption_placeholders,
            totals.offer_claims,
        ),
    };

    ConversionSummary {
        business_id: business_id.into(),
        range: range.as_str().into(),
        funnel: vec![
            FunnelStep {
                id: "impressions",
                label: "Seen in matches",
                count: totals.impressions,
            },
            FunnelStep {
                id: "positive_intent",
                label: "Saved or matched",
                count: positive_intent,
            },
            FunnelStep {
                id: "profile_opens",
                label: "Opened profile",
                count: totals.profile_opens,
            },
            FunnelStep {
                id: "actions",
                label: "Claimed, routed, or checked in",
                count: actions,
            },
            FunnelStep {
                id: "redemptions",
                label: "Use placeholder recorded",
                count: totals.redemption_placeholders,
            },
        ],
        top_match_reasons: aggregate_reasons(rows, &["swipe_right", "save", "match"]),
        top_skipped_reasons: aggregate_reasons(rows, &["swipe_left"]),
        totals,
        rates,
    }
}

fn build_timeseries(
    business_id: &str,
    range: ConversionRange,
    rows: &[Value],
) -> ConversionTimeseries {
    let mut buckets: BTreeMap<NaiveDate, TimeseriesBucket> = BTreeMap::new();

    for row in rows {
        let Some(date) = event_date(row) else {
            continue;
        };
        let bucket = buckets.entry(date).or_insert_with(|| TimeseriesBucket {
            date: date.to_string(),
            ..Default::default()
        });

        match value_str(row, "event_type") {
            "match_card_impression" => bucket.impressions += 1,
            "save" => bucket.saves += 1,
            "match" => bucket.matches += 1,
            "business_profile_open" => bucket.profile_opens += 1,
            "offer_claim" => bucket.offer_claims += 1,
            "directions_click" => bucket.directions_clicks += 1,
            "check_in_placeholder" => bucket.check_ins += 1,
            "redemption_placeholder" => bucket.redemption_placeholders += 1,
            _ => {}
        }
    }

    ConversionTimeseries {
        business_id: business_id.into(),
        range: range.as_str().into(),
        bucket: "day",
        buckets: buckets.into_values().collect(),
    }
}

fn aggregate_totals(rows: &[Value]) -> ConversionTotals {
    let mut totals = ConversionTotals::default();

    for row in rows {
        match value_str(row, "event_type") {
            "match_card_impression" => totals.impressions += 1,
            "swipe_left" => totals.swipe_left += 1,
            "swipe_right" => totals.swipe_right += 1,
            "save" => totals.saves += 1,
            "match" => totals.matches += 1,
            "business_profile_open" => totals.profile_opens += 1,
            "offer_claim" => totals.offer_claims += 1,
            "directions_click" => totals.directions_clicks += 1,
            "check_in_placeholder" => totals.check_ins += 1,
            "redemption_placeholder" => totals.redemption_placeholders += 1,
            _ => {}
        }
    }

    totals
}

fn aggregate_reasons(rows: &[Value], event_types: &[&str]) -> Vec<ReasonCount> {
    let mut counts = BTreeMap::<String, i64>::new();

    for row in rows {
        let event_type = value_str(row, "event_type");
        if !event_types.contains(&event_type) {
            continue;
        }

        for reason in row
            .get("match_reason_codes")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            let code = normalize_reason_code(reason);
            if !code.is_empty() {
                *counts.entry(code).or_default() += 1;
            }
        }
    }

    let mut reasons = counts
        .into_iter()
        .map(|(reason_code, count)| ReasonCount {
            label: reason_label(&reason_code),
            reason_code,
            count,
        })
        .collect::<Vec<_>>();
    reasons.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| a.reason_code.cmp(&b.reason_code))
    });
    reasons.truncate(5);
    reasons
}

fn normalize_reason_code(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
        .take(80)
        .collect::<String>()
        .to_ascii_lowercase()
}

fn reason_label(code: &str) -> String {
    match code {
        "high_trust" => "High trust".into(),
        "open_now" => "Open now".into(),
        "nearby" => "Nearby".into(),
        "trending" => "Trending".into(),
        "hidden_gem" => "Hidden gem".into(),
        "most_trusted" => "Most trusted".into(),
        "price_match" => "Price match".into(),
        "category_match" => "Category match".into(),
        "too_far" => "Farther away".into(),
        _ => code
            .split(['_', '-'])
            .filter(|part| !part.is_empty())
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => {
                        format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
                    }
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn safe_rate(numerator: i64, denominator: i64) -> f64 {
    if denominator <= 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

fn event_date(row: &Value) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(value_str(row, "created_at"))
        .ok()
        .map(|value| value.date_naive())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn invalid_range_is_rejected() {
        assert!(parse_range(Some("7d")).is_ok());
        assert!(parse_range(Some("30d")).is_ok());
        assert!(parse_range(Some("90d")).is_ok());
        assert!(parse_range(Some("365d")).is_err());
    }

    #[test]
    fn authorization_allows_owner_or_admin_only() {
        let owner = auth_user("550e8400-e29b-41d4-a716-446655440000", "business_owner");
        let other_owner = auth_user("660e8400-e29b-41d4-a716-446655440000", "business_owner");
        let admin = auth_user("770e8400-e29b-41d4-a716-446655440000", "admin");

        assert!(ensure_owner_authorized("550e8400-e29b-41d4-a716-446655440000", &owner).is_ok());
        assert!(ensure_owner_authorized("550e8400-e29b-41d4-a716-446655440000", &admin).is_ok());
        assert!(ensure_owner_authorized("550e8400-e29b-41d4-a716-446655440000", &other_owner).is_err());
    }

    #[test]
    fn summary_counts_rates_funnel_and_reasons_are_aggregated() {
        let rows = vec![
            event("match_card_impression", "2026-06-01T00:00:00Z", json!(["high_trust"])),
            event("match_card_impression", "2026-06-01T01:00:00Z", json!(["open_now"])),
            event("swipe_right", "2026-06-01T02:00:00Z", json!(["high_trust"])),
            event("save", "2026-06-02T00:00:00Z", json!(["open_now", "nearby"])),
            event("match", "2026-06-02T01:00:00Z", json!(["high_trust"])),
            event("business_profile_open", "2026-06-03T00:00:00Z", json!([])),
            event("offer_claim", "2026-06-03T01:00:00Z", json!([])),
            event("directions_click", "2026-06-04T00:00:00Z", json!([])),
            event("check_in_placeholder", "2026-06-04T01:00:00Z", json!([])),
            event("redemption_placeholder", "2026-06-05T00:00:00Z", json!([])),
            event("swipe_left", "2026-06-05T01:00:00Z", json!(["too_far", "open_now"])),
            event("swipe_left", "2026-06-05T02:00:00Z", json!(["too_far"])),
        ];

        let summary = build_summary("550e8400-e29b-41d4-a716-446655440000", ConversionRange::Days30, &rows);

        assert_eq!(summary.totals.impressions, 2);
        assert_eq!(summary.totals.saves, 1);
        assert_eq!(summary.totals.matches, 1);
        assert_eq!(summary.totals.swipe_left, 2);
        assert_eq!(summary.totals.offer_claims, 1);
        assert_eq!(summary.totals.directions_clicks, 1);
        assert_eq!(summary.totals.check_ins, 1);
        assert_eq!(summary.totals.redemption_placeholders, 1);
        assert_eq!(summary.rates.match_rate, 0.5);
        assert_eq!(summary.rates.save_rate, 0.5);
        assert_eq!(summary.rates.profile_open_rate, 0.5);
        assert_eq!(summary.rates.action_rate, 1.5);
        assert_eq!(summary.rates.claim_rate, 1.0);
        assert_eq!(summary.rates.redemption_placeholder_rate, 1.0);
        assert_eq!(summary.funnel[1].count, 2);
        assert_eq!(summary.funnel[3].count, 3);
        assert_eq!(summary.top_match_reasons[0].reason_code, "high_trust");
        assert_eq!(summary.top_match_reasons[0].count, 2);
        assert_eq!(summary.top_skipped_reasons[0].reason_code, "too_far");
        assert_eq!(summary.top_skipped_reasons[0].count, 2);
    }

    #[test]
    fn summary_rates_handle_zero_denominators() {
        let summary = build_summary(
            "550e8400-e29b-41d4-a716-446655440000",
            ConversionRange::Days30,
            &[event("offer_claim", "2026-06-01T00:00:00Z", json!([]))],
        );

        assert_eq!(summary.rates.match_rate, 0.0);
        assert_eq!(summary.rates.claim_rate, 0.0);
        assert_eq!(summary.rates.redemption_placeholder_rate, 0.0);
    }

    #[test]
    fn timeseries_buckets_daily_counts() {
        let rows = vec![
            event("match_card_impression", "2026-06-01T10:00:00Z", json!([])),
            event("match_card_impression", "2026-06-01T11:00:00Z", json!([])),
            event("save", "2026-06-01T12:00:00Z", json!([])),
            event("offer_claim", "2026-06-02T10:00:00Z", json!([])),
        ];

        let series = build_timeseries(
            "550e8400-e29b-41d4-a716-446655440000",
            ConversionRange::Days7,
            &rows,
        );

        assert_eq!(series.buckets.len(), 2);
        assert_eq!(series.buckets[0].date, "2026-06-01");
        assert_eq!(series.buckets[0].impressions, 2);
        assert_eq!(series.buckets[0].saves, 1);
        assert_eq!(series.buckets[1].date, "2026-06-02");
        assert_eq!(series.buckets[1].offer_claims, 1);
    }

    fn event(event_type: &str, created_at: &str, reason_codes: serde_json::Value) -> serde_json::Value {
        json!({
            "event_type": event_type,
            "created_at": created_at,
            "match_reason_codes": reason_codes
        })
    }

    fn auth_user(id: &str, role: &str) -> AuthUser {
        AuthUser {
            id: id.into(),
            email: "owner@example.com".into(),
            name: "Owner".into(),
            role: role.into(),
        }
    }
}

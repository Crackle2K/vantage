use crate::{
    errors::{AppError, Result},
    middleware::auth::AuthUser,
    routes::support::{eq, limit, order, q, select_all, value_str},
    security,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Map, Value};
use std::{collections::BTreeMap, sync::Arc};

const CAMPAIGN_TYPES: &[&str] = &[
    "slow_hour",
    "first_time_visitor",
    "event_promotion",
    "limited_time_perk",
    "non_discount",
    "custom_template",
];

const CAMPAIGN_EVENT_TYPES: &[&str] = &[
    "campaign_impression",
    "campaign_open",
    "campaign_claim",
    "campaign_directions_click",
    "check_in_placeholder",
    "campaign_redemption_placeholder",
];

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/campaign-templates", get(list_campaign_templates))
        .route(
            "/businesses/:id/campaigns",
            get(list_business_campaigns).post(create_campaign),
        )
        .route(
            "/campaigns/:id",
            get(get_campaign)
                .put(update_campaign)
                .delete(cancel_campaign),
        )
        .route("/campaigns/:id/claim", post(claim_campaign))
        .route(
            "/campaign-claims/:id/redeem-placeholder",
            post(redeem_campaign_claim_placeholder),
        )
        .route(
            "/businesses/:id/campaign-performance",
            get(get_campaign_performance),
        )
}

#[derive(Deserialize)]
struct CampaignListQuery {
    status: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct CampaignCreate {
    title: String,
    description: String,
    campaign_type: String,
    offer_kind: Option<String>,
    discount_type: Option<String>,
    discount_value: Option<f64>,
    perk_description: Option<String>,
    starts_at: Option<String>,
    ends_at: String,
    status: Option<String>,
    targeting: Option<Value>,
    template_id: Option<String>,
    linked_event_id: Option<String>,
    claim_limit: Option<i64>,
    per_user_limit: Option<i64>,
    metadata: Option<Value>,
}

#[derive(Deserialize)]
struct CampaignUpdate {
    title: Option<String>,
    description: Option<String>,
    campaign_type: Option<String>,
    offer_kind: Option<String>,
    discount_type: Option<String>,
    discount_value: Option<f64>,
    perk_description: Option<String>,
    starts_at: Option<String>,
    ends_at: Option<String>,
    status: Option<String>,
    targeting: Option<Value>,
    template_id: Option<String>,
    linked_event_id: Option<String>,
    claim_limit: Option<i64>,
    per_user_limit: Option<i64>,
    metadata: Option<Value>,
}

#[derive(Deserialize, Default)]
struct CampaignActionPayload {
    source_surface: Option<String>,
    anonymous_session_id: Option<String>,
    intent: Option<String>,
    metadata: Option<Value>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
enum CampaignRange {
    Days7,
    Days30,
    Days90,
}

impl CampaignRange {
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

impl Default for CampaignRange {
    fn default() -> Self {
        Self::Days30
    }
}

impl<'de> Deserialize<'de> for CampaignRange {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        parse_range(Some(&value)).map_err(serde::de::Error::custom)
    }
}

#[derive(Deserialize)]
struct PerformanceQuery {
    #[serde(default)]
    range: CampaignRange,
}

#[derive(Default, Debug, Clone, Serialize)]
struct CampaignPerformanceTotals {
    impressions: i64,
    opens: i64,
    claims: i64,
    directions_clicks: i64,
    check_ins: i64,
    redemption_placeholders: i64,
}

#[derive(Default, Debug, Clone, Serialize)]
struct CampaignPerformanceRates {
    open_rate: f64,
    claim_rate: f64,
    action_rate: f64,
    redemption_placeholder_rate: f64,
}

#[derive(Default, Debug, Clone, Serialize)]
struct CampaignPerformanceBucket {
    date: String,
    impressions: i64,
    opens: i64,
    claims: i64,
    directions_clicks: i64,
    check_ins: i64,
    redemption_placeholders: i64,
}

#[derive(Debug, Clone, Serialize)]
struct TopCampaign {
    campaign_id: String,
    title: String,
    campaign_type: String,
    status: String,
    actions: i64,
    claims: i64,
    impressions: i64,
}

#[derive(Debug, Clone, Serialize)]
struct CampaignPerformance {
    business_id: String,
    range: String,
    totals: CampaignPerformanceTotals,
    rates: CampaignPerformanceRates,
    buckets: Vec<CampaignPerformanceBucket>,
    top_campaigns: Vec<TopCampaign>,
}

async fn list_campaign_templates() -> Result<impl IntoResponse> {
    Ok(Json(json!({ "items": campaign_templates() })))
}

async fn list_business_campaigns(
    State(state): State<Arc<AppState>>,
    auth_user: Option<Extension<AuthUser>>,
    Path(business_id): Path<String>,
    Query(params): Query<CampaignListQuery>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    let status = params.status.as_deref().unwrap_or("active");
    if status != "active" {
        let Some(Extension(auth_user)) = auth_user else {
            return Err(AppError::Unauthorized(
                "Sign in as the business owner to view campaign drafts".into(),
            ));
        };
        let business = find_business(&state, &business_id).await?;
        ensure_business_owner(&business, &auth_user)?;
    }

    let mut query = vec![
        select_all(),
        eq("business_id", &business_id),
        order("created_at.desc"),
        limit(params.limit.unwrap_or(50).clamp(1, 100)),
    ];

    match status {
        "active" => {
            query.push(eq("status", "active"));
            query.push(active_campaign_filter(Utc::now()));
        }
        "draft" | "scheduled" | "ended" | "cancelled" => {
            query.push(eq(
                "status",
                validate_campaign_status(params.status.as_deref())?,
            ));
        }
        "all" => {}
        _ => return Err(AppError::BadRequest("Invalid campaign status".into())),
    }

    let rows = state
        .db
        .supabase
        .select_json("campaigns", &query)
        .await?
        .into_iter()
        .map(normalize_campaign)
        .collect::<Vec<_>>();
    Ok(Json(json!({ "items": rows })))
}

async fn get_campaign(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let campaign = find_campaign(&state, &id).await?;
    let business = find_business(&state, value_str(&campaign, "business_id")).await?;
    ensure_business_owner(&business, &auth_user)?;
    Ok(Json(normalize_campaign(campaign)))
}

async fn create_campaign(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(business_id): Path<String>,
    Json(payload): Json<CampaignCreate>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    let business = find_business(&state, &business_id).await?;
    ensure_business_owner(&business, &auth_user)?;

    let body = build_campaign_body(&business_id, &auth_user.id, payload)?;
    let created = state.db.supabase.insert_json("campaigns", body).await?;

    Ok((StatusCode::CREATED, Json(normalize_campaign(created))))
}

async fn update_campaign(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<CampaignUpdate>,
) -> Result<impl IntoResponse> {
    let campaign = find_campaign(&state, &id).await?;
    let business = find_business(&state, value_str(&campaign, "business_id")).await?;
    ensure_business_owner(&business, &auth_user)?;

    let body = build_campaign_update_body(payload)?;
    let updated = state
        .db
        .supabase
        .update_json("campaigns", &[eq("id", &id)], body)
        .await?;
    let row = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;

    Ok(Json(normalize_campaign(row)))
}

async fn cancel_campaign(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let campaign = find_campaign(&state, &id).await?;
    let business = find_business(&state, value_str(&campaign, "business_id")).await?;
    ensure_business_owner(&business, &auth_user)?;

    let updated = state
        .db
        .supabase
        .update_json(
            "campaigns",
            &[eq("id", &id)],
            json!({ "status": "cancelled", "updated_at": Utc::now().to_rfc3339() }),
        )
        .await?;
    let row = updated
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;

    Ok(Json(normalize_campaign(row)))
}

async fn claim_campaign(
    State(state): State<Arc<AppState>>,
    auth_user: Option<Extension<AuthUser>>,
    Path(id): Path<String>,
    Json(payload): Json<CampaignActionPayload>,
) -> Result<impl IntoResponse> {
    let campaign_id = security::validate_uuid_id(&id, "campaign ID")?;
    let Some(Extension(auth_user)) = auth_user else {
        return Err(AppError::Unauthorized(
            "Sign in to claim campaigns durably".into(),
        ));
    };

    let campaign = find_campaign(&state, &campaign_id).await?;
    if !campaign_is_active(&campaign) {
        return Err(AppError::BadRequest("Campaign is not active".into()));
    }

    let claimed_at = Utc::now();
    let body = build_campaign_claim_body(&campaign, &auth_user, claimed_at)?;
    let claim = state
        .db
        .supabase
        .insert_json("campaign_claims", body)
        .await?;
    let claim_id = value_str(&claim, "id").to_string();
    let business_id = value_str(&campaign, "business_id").to_string();

    if let Err(err) = insert_campaign_event(
        &state,
        "campaign_claim",
        &business_id,
        Some(&campaign_id),
        Some(&claim_id),
        Some(&auth_user),
        &payload,
    )
    .await
    {
        tracing::warn!(error = %err, "Campaign claim event tracking failed");
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "campaign_claim_id": claim_id,
            "campaign_id": campaign_id,
            "business_id": business_id,
            "claim_code": value_str(&claim, "claim_code"),
            "status": value_str(&claim, "status"),
            "claimed_at": claim.get("claimed_at").cloned().unwrap_or_else(|| json!(claimed_at.to_rfc3339())),
            "expires_at": claim.get("expires_at").cloned().unwrap_or(Value::Null),
        })),
    ))
}

async fn redeem_campaign_claim_placeholder(
    State(state): State<Arc<AppState>>,
    auth_user: Option<Extension<AuthUser>>,
    Path(id): Path<String>,
    Json(payload): Json<CampaignActionPayload>,
) -> Result<impl IntoResponse> {
    let campaign_claim_id = security::validate_uuid_id(&id, "campaign claim ID")?;
    let Some(Extension(auth_user)) = auth_user else {
        return Err(AppError::Unauthorized(
            "Sign in to record campaign placeholder actions".into(),
        ));
    };
    let claim = find_campaign_claim(&state, &campaign_claim_id).await?;
    if value_str(&claim, "user_id") != auth_user.id {
        return Err(AppError::Forbidden(
            "Campaign claim belongs to another user".into(),
        ));
    }

    let business_id = security::validate_uuid_id(value_str(&claim, "business_id"), "business ID")?;
    let campaign_id = security::validate_uuid_id(value_str(&claim, "campaign_id"), "campaign ID")?;
    insert_campaign_event(
        &state,
        "campaign_redemption_placeholder",
        &business_id,
        Some(&campaign_id),
        Some(&campaign_claim_id),
        Some(&auth_user),
        &payload,
    )
    .await?;

    Ok(Json(json!({
        "campaign_claim_id": campaign_claim_id,
        "status": "recorded",
        "verified": false,
    })))
}

async fn get_campaign_performance(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(business_id): Path<String>,
    Query(query): Query<PerformanceQuery>,
) -> Result<impl IntoResponse> {
    let business_id = security::validate_uuid_id(&business_id, "business ID")?;
    let business = find_business(&state, &business_id).await?;
    ensure_business_owner(&business, &auth_user)?;

    let range_start = Utc::now() - Duration::days(query.range.days());
    let campaigns = state
        .db
        .supabase
        .select_json(
            "campaigns",
            &[
                select_all(),
                eq("business_id", &business_id),
                order("created_at.desc"),
                limit(100),
            ],
        )
        .await?;
    let events = state
        .db
        .supabase
        .select_json(
            "customer_events",
            &[
                ("select".into(), "event_type,campaign_id,created_at".into()),
                eq("business_id", &business_id),
                (
                    "created_at".into(),
                    format!("gte.{}", range_start.to_rfc3339()),
                ),
                (
                    "event_type".into(),
                    format!("in.({})", CAMPAIGN_EVENT_TYPES.join(",")),
                ),
                order("created_at.asc"),
            ],
        )
        .await?;

    Ok(Json(build_campaign_performance(
        &business_id,
        query.range,
        &campaigns,
        &events,
    )))
}

fn build_campaign_body(
    business_id: &str,
    owner_id: &str,
    payload: CampaignCreate,
) -> Result<Value> {
    let now = Utc::now();
    let starts_at = payload
        .starts_at
        .as_deref()
        .map(|value| validate_rfc3339("starts_at", value))
        .transpose()?
        .unwrap_or_else(|| now.to_rfc3339());
    let ends_at = validate_rfc3339("ends_at", &payload.ends_at)?;
    ensure_date_order(&starts_at, &ends_at)?;
    let status = match payload.status.as_deref() {
        Some(value) => validate_campaign_status(Some(value))?,
        None => {
            if starts_at > now.to_rfc3339() {
                "scheduled"
            } else {
                "active"
            }
        }
    };

    let mut body = Map::new();
    body.insert("business_id".into(), json!(business_id));
    body.insert("owner_id".into(), json!(owner_id));
    body.insert(
        "title".into(),
        json!(required_text(&payload.title, "title", 160)?),
    );
    body.insert(
        "description".into(),
        json!(required_text(&payload.description, "description", 1000)?),
    );
    body.insert(
        "campaign_type".into(),
        json!(validate_campaign_type(&payload.campaign_type)?),
    );
    body.insert(
        "offer_kind".into(),
        json!(validate_offer_kind(payload.offer_kind.as_deref())?),
    );
    body.insert("starts_at".into(), json!(starts_at));
    body.insert("ends_at".into(), json!(ends_at));
    body.insert("status".into(), json!(status));
    body.insert("targeting".into(), normalize_targeting(payload.targeting)?);
    body.insert(
        "metadata".into(),
        normalize_object(payload.metadata, "metadata")?,
    );
    body.insert("affects_lvs".into(), json!(false));
    body.insert("created_at".into(), json!(now.to_rfc3339()));
    body.insert("updated_at".into(), json!(now.to_rfc3339()));

    if let Some(discount_type) = payload.discount_type.as_deref() {
        body.insert(
            "discount_type".into(),
            json!(validate_discount_type(discount_type)?),
        );
    }
    if let Some(value) = validate_optional_non_negative(payload.discount_value, "discount_value")? {
        body.insert("discount_value".into(), json!(value));
    }
    if let Some(perk) = payload
        .perk_description
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 500))
    {
        body.insert("perk_description".into(), json!(perk));
    }
    if let Some(template_id) = payload
        .template_id
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 80))
    {
        body.insert("template_id".into(), json!(template_id));
    }
    if let Some(event_id) = payload.linked_event_id.as_deref() {
        body.insert(
            "linked_event_id".into(),
            json!(security::validate_uuid_id(event_id, "event ID")?),
        );
    }
    if let Some(value) = validate_optional_positive(payload.claim_limit, "claim_limit")? {
        body.insert("claim_limit".into(), json!(value));
    }
    if let Some(value) = validate_optional_positive(payload.per_user_limit, "per_user_limit")? {
        body.insert("per_user_limit".into(), json!(value));
    }

    Ok(Value::Object(body))
}

fn build_campaign_update_body(payload: CampaignUpdate) -> Result<Value> {
    let mut body = Map::new();
    body.insert("updated_at".into(), json!(Utc::now().to_rfc3339()));
    insert_optional_text(&mut body, "title", payload.title.as_deref(), 160);
    insert_optional_text(
        &mut body,
        "description",
        payload.description.as_deref(),
        1000,
    );
    insert_optional_text(
        &mut body,
        "perk_description",
        payload.perk_description.as_deref(),
        500,
    );
    if let Some(value) = payload.campaign_type.as_deref() {
        body.insert(
            "campaign_type".into(),
            json!(validate_campaign_type(value)?),
        );
    }
    if let Some(value) = payload.offer_kind.as_deref() {
        body.insert(
            "offer_kind".into(),
            json!(validate_offer_kind(Some(value))?),
        );
    }
    if let Some(value) = payload.discount_type.as_deref() {
        body.insert(
            "discount_type".into(),
            json!(validate_discount_type(value)?),
        );
    }
    if let Some(value) = validate_optional_non_negative(payload.discount_value, "discount_value")? {
        body.insert("discount_value".into(), json!(value));
    }
    if let Some(value) = payload.starts_at.as_deref() {
        body.insert(
            "starts_at".into(),
            json!(validate_rfc3339("starts_at", value)?),
        );
    }
    if let Some(value) = payload.ends_at.as_deref() {
        body.insert("ends_at".into(), json!(validate_rfc3339("ends_at", value)?));
    }
    if let Some(value) = payload.status.as_deref() {
        body.insert(
            "status".into(),
            json!(validate_campaign_status(Some(value))?),
        );
    }
    if payload.targeting.is_some() {
        body.insert("targeting".into(), normalize_targeting(payload.targeting)?);
    }
    if let Some(value) = payload.template_id.as_deref() {
        body.insert(
            "template_id".into(),
            json!(security::sanitize_text(value, 80)),
        );
    }
    if let Some(value) = payload.linked_event_id.as_deref() {
        body.insert(
            "linked_event_id".into(),
            json!(security::validate_uuid_id(value, "event ID")?),
        );
    }
    if let Some(value) = validate_optional_positive(payload.claim_limit, "claim_limit")? {
        body.insert("claim_limit".into(), json!(value));
    }
    if let Some(value) = validate_optional_positive(payload.per_user_limit, "per_user_limit")? {
        body.insert("per_user_limit".into(), json!(value));
    }
    if payload.metadata.is_some() {
        body.insert(
            "metadata".into(),
            normalize_object(payload.metadata, "metadata")?,
        );
    }

    Ok(Value::Object(body))
}

fn build_campaign_claim_body(
    campaign: &Value,
    auth_user: &AuthUser,
    claimed_at: DateTime<Utc>,
) -> Result<Value> {
    let campaign_id = security::validate_uuid_id(value_str(campaign, "id"), "campaign ID")?;
    let business_id =
        security::validate_uuid_id(value_str(campaign, "business_id"), "business ID")?;
    let mut body = Map::new();
    body.insert("campaign_id".into(), json!(campaign_id));
    body.insert("business_id".into(), json!(business_id));
    body.insert("user_id".into(), json!(auth_user.id));
    body.insert("claim_code".into(), json!(generate_claim_code()));
    body.insert("status".into(), json!("claimed"));
    body.insert("claimed_at".into(), json!(claimed_at.to_rfc3339()));
    body.insert("created_at".into(), json!(claimed_at.to_rfc3339()));
    body.insert("updated_at".into(), json!(claimed_at.to_rfc3339()));
    body.insert("metadata".into(), json!({}));
    body.insert("affects_lvs".into(), json!(false));

    if !value_str(campaign, "ends_at").is_empty() {
        body.insert("expires_at".into(), json!(value_str(campaign, "ends_at")));
    }

    Ok(Value::Object(body))
}

fn build_campaign_performance(
    business_id: &str,
    range: CampaignRange,
    campaigns: &[Value],
    events: &[Value],
) -> CampaignPerformance {
    let mut campaign_titles = BTreeMap::<String, (String, String, String)>::new();
    for campaign in campaigns {
        let id = value_str(campaign, "id").to_string();
        if !id.is_empty() {
            campaign_titles.insert(
                id,
                (
                    value_str(campaign, "title").to_string(),
                    value_str(campaign, "campaign_type").to_string(),
                    value_str(campaign, "status").to_string(),
                ),
            );
        }
    }

    let mut totals = CampaignPerformanceTotals::default();
    let mut buckets = BTreeMap::<NaiveDate, CampaignPerformanceBucket>::new();
    let mut per_campaign = BTreeMap::<String, CampaignPerformanceTotals>::new();

    for event in events {
        let event_type = value_str(event, "event_type");
        let campaign_id = value_str(event, "campaign_id").to_string();
        if event_type == "check_in_placeholder" && campaign_id.is_empty() {
            continue;
        }
        increment_campaign_totals(&mut totals, event_type);
        if !campaign_id.is_empty() {
            increment_campaign_totals(per_campaign.entry(campaign_id).or_default(), event_type);
        }
        if let Some(date) = event_date(event) {
            let bucket = buckets
                .entry(date)
                .or_insert_with(|| CampaignPerformanceBucket {
                    date: date.to_string(),
                    ..Default::default()
                });
            increment_campaign_bucket(bucket, event_type);
        }
    }

    let actions = totals.claims
        + totals.directions_clicks
        + totals.check_ins
        + totals.redemption_placeholders;
    let mut top_campaigns = per_campaign
        .into_iter()
        .map(|(campaign_id, campaign_totals)| {
            let (title, campaign_type, status) = campaign_titles
                .get(&campaign_id)
                .cloned()
                .unwrap_or(("Campaign".into(), String::new(), String::new()));
            TopCampaign {
                campaign_id,
                title,
                campaign_type,
                status,
                actions: campaign_totals.claims
                    + campaign_totals.directions_clicks
                    + campaign_totals.check_ins
                    + campaign_totals.redemption_placeholders,
                claims: campaign_totals.claims,
                impressions: campaign_totals.impressions,
            }
        })
        .collect::<Vec<_>>();
    top_campaigns.sort_by(|a, b| {
        b.actions
            .cmp(&a.actions)
            .then_with(|| b.claims.cmp(&a.claims))
    });
    top_campaigns.truncate(5);

    CampaignPerformance {
        business_id: business_id.into(),
        range: range.as_str().into(),
        rates: CampaignPerformanceRates {
            open_rate: safe_rate(totals.opens, totals.impressions),
            claim_rate: safe_rate(totals.claims, totals.opens),
            action_rate: safe_rate(actions, totals.impressions),
            redemption_placeholder_rate: safe_rate(totals.redemption_placeholders, totals.claims),
        },
        totals,
        buckets: buckets.into_values().collect(),
        top_campaigns,
    }
}

fn increment_campaign_totals(totals: &mut CampaignPerformanceTotals, event_type: &str) {
    match event_type {
        "campaign_impression" => totals.impressions += 1,
        "campaign_open" => totals.opens += 1,
        "campaign_claim" => totals.claims += 1,
        "campaign_directions_click" => totals.directions_clicks += 1,
        "check_in_placeholder" => totals.check_ins += 1,
        "campaign_redemption_placeholder" => totals.redemption_placeholders += 1,
        _ => {}
    }
}

fn increment_campaign_bucket(bucket: &mut CampaignPerformanceBucket, event_type: &str) {
    match event_type {
        "campaign_impression" => bucket.impressions += 1,
        "campaign_open" => bucket.opens += 1,
        "campaign_claim" => bucket.claims += 1,
        "campaign_directions_click" => bucket.directions_clicks += 1,
        "check_in_placeholder" => bucket.check_ins += 1,
        "campaign_redemption_placeholder" => bucket.redemption_placeholders += 1,
        _ => {}
    }
}

async fn insert_campaign_event(
    state: &AppState,
    event_type: &str,
    business_id: &str,
    campaign_id: Option<&str>,
    campaign_claim_id: Option<&str>,
    auth_user: Option<&AuthUser>,
    payload: &CampaignActionPayload,
) -> Result<()> {
    let mut body = Map::new();
    body.insert("event_type".into(), json!(event_type));
    body.insert("business_id".into(), json!(business_id));
    body.insert(
        "source_surface".into(),
        json!(payload
            .source_surface
            .as_deref()
            .and_then(|value| security::sanitize_optional_text(Some(value), 80))
            .unwrap_or_else(|| "business_modal".into())),
    );
    body.insert("constraints".into(), json!([]));
    body.insert("match_reason_codes".into(), json!([]));
    body.insert("location_context".into(), json!({}));
    body.insert(
        "metadata".into(),
        normalize_object(payload.metadata.clone(), "metadata")?,
    );
    body.insert("affects_lvs".into(), json!(false));
    body.insert("created_at".into(), json!(Utc::now().to_rfc3339()));

    if let Some(user) = auth_user {
        body.insert("user_id".into(), json!(user.id));
    }
    if let Some(session_id) = payload
        .anonymous_session_id
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 120))
    {
        body.insert("anonymous_session_id".into(), json!(session_id));
    }
    if let Some(intent) = payload
        .intent
        .as_deref()
        .and_then(|value| security::sanitize_optional_text(Some(value), 80))
    {
        body.insert("intent".into(), json!(intent));
    }
    if let Some(campaign_id) = campaign_id {
        body.insert("campaign_id".into(), json!(campaign_id));
    }
    if let Some(campaign_claim_id) = campaign_claim_id {
        body.insert("campaign_claim_id".into(), json!(campaign_claim_id));
    }

    state
        .db
        .supabase
        .insert_json("customer_events", Value::Object(body))
        .await?;
    Ok(())
}

fn campaign_templates() -> Vec<Value> {
    vec![
        json!({
            "id": "slow_tuesday",
            "name": "Slow Tuesday",
            "campaign_type": "slow_hour",
            "offer_kind": "perk",
            "title": "Slow-hour local perk",
            "description": "A small extra for neighbors who visit during quieter hours.",
            "perk_description": "Free add-on during selected slow hours",
            "targeting": { "audience": "all_visitors", "time_window": "slow_hour" },
            "recommended_duration_days": 7
        }),
        json!({
            "id": "first_visit_welcome",
            "name": "First Visit Welcome",
            "campaign_type": "first_time_visitor",
            "offer_kind": "perk",
            "title": "Welcome perk for first visits",
            "description": "Give new customers a reason to try you once.",
            "perk_description": "First-visit welcome add-on",
            "targeting": { "audience": "first_time_visitors" },
            "recommended_duration_days": 14
        }),
        json!({
            "id": "tonight_event_push",
            "name": "Tonight's Event Push",
            "campaign_type": "event_promotion",
            "offer_kind": "event",
            "title": "Tonight only event perk",
            "description": "Bring nearby customers into an upcoming event.",
            "perk_description": "Event-only perk",
            "targeting": { "audience": "event_interested" },
            "recommended_duration_days": 2
        }),
        json!({
            "id": "forty_eight_hour_perk",
            "name": "48-Hour Local Perk",
            "campaign_type": "limited_time_perk",
            "offer_kind": "perk",
            "title": "48-hour neighborhood perk",
            "description": "A short, time-boxed reason to visit soon.",
            "perk_description": "Limited-time local perk",
            "targeting": { "audience": "all_visitors" },
            "recommended_duration_days": 2
        }),
        json!({
            "id": "bring_a_friend",
            "name": "Bring a Friend",
            "campaign_type": "non_discount",
            "offer_kind": "perk",
            "title": "Bring-a-friend perk",
            "description": "Encourage groups without discounting your core product.",
            "perk_description": "Small group add-on",
            "targeting": { "audience": "all_visitors" },
            "recommended_duration_days": 10
        }),
        json!({
            "id": "free_add_on",
            "name": "Free Add-On",
            "campaign_type": "non_discount",
            "offer_kind": "perk",
            "title": "Free add-on perk",
            "description": "Offer an extra touch instead of lowering price.",
            "perk_description": "Free add-on with visit",
            "targeting": { "audience": "saved_business_users" },
            "recommended_duration_days": 7
        }),
    ]
}

fn validate_campaign_type(value: &str) -> Result<&'static str> {
    let cleaned = security::sanitize_text(value, 80);
    CAMPAIGN_TYPES
        .iter()
        .copied()
        .find(|campaign_type| *campaign_type == cleaned)
        .ok_or_else(|| AppError::BadRequest("Invalid campaign type".into()))
}

fn validate_campaign_status(value: Option<&str>) -> Result<&'static str> {
    match value
        .unwrap_or("active")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "draft" => Ok("draft"),
        "scheduled" => Ok("scheduled"),
        "active" => Ok("active"),
        "ended" => Ok("ended"),
        "cancelled" => Ok("cancelled"),
        _ => Err(AppError::BadRequest("Invalid campaign status".into())),
    }
}

fn validate_offer_kind(value: Option<&str>) -> Result<&'static str> {
    match value.unwrap_or("perk").trim().to_ascii_lowercase().as_str() {
        "discount" => Ok("discount"),
        "perk" => Ok("perk"),
        "event" => Ok("event"),
        "non_discount" => Ok("non_discount"),
        _ => Err(AppError::BadRequest("Invalid offer kind".into())),
    }
}

fn validate_discount_type(value: &str) -> Result<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "percentage" | "percent" => Ok("percentage"),
        "fixed" | "fixed_amount" | "amount" => Ok("fixed"),
        _ => Err(AppError::BadRequest("Invalid discount type".into())),
    }
}

fn normalize_targeting(value: Option<Value>) -> Result<Value> {
    let mut targeting = match normalize_object(value, "targeting")? {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let audience = targeting
        .get("audience")
        .and_then(Value::as_str)
        .unwrap_or("all_visitors");
    let audience = match audience {
        "all_visitors"
        | "first_time_visitors"
        | "saved_business_users"
        | "slow_hour"
        | "event_interested"
        | "intent_match"
        | "category_match" => audience,
        _ => return Err(AppError::BadRequest("Invalid campaign audience".into())),
    };
    targeting.insert("audience".into(), json!(audience));
    Ok(Value::Object(targeting))
}

fn normalize_object(value: Option<Value>, label: &str) -> Result<Value> {
    match value {
        Some(Value::Object(map)) => Ok(Value::Object(map)),
        None => Ok(json!({})),
        _ => Err(AppError::BadRequest(format!("{} must be an object", label))),
    }
}

fn required_text(value: &str, label: &str, max: usize) -> Result<String> {
    security::sanitize_optional_text(Some(value), max)
        .ok_or_else(|| AppError::BadRequest(format!("{} is required", label)))
}

fn insert_optional_text(body: &mut Map<String, Value>, key: &str, value: Option<&str>, max: usize) {
    if let Some(value) = value.and_then(|raw| security::sanitize_optional_text(Some(raw), max)) {
        body.insert(key.into(), json!(value));
    }
}

fn validate_optional_non_negative(value: Option<f64>, label: &str) -> Result<Option<f64>> {
    match value {
        Some(value) if value.is_finite() && value >= 0.0 => Ok(Some(value)),
        Some(_) => Err(AppError::BadRequest(format!("Invalid {}", label))),
        None => Ok(None),
    }
}

fn validate_optional_positive(value: Option<i64>, label: &str) -> Result<Option<i64>> {
    match value {
        Some(value) if value > 0 => Ok(Some(value)),
        Some(_) => Err(AppError::BadRequest(format!("Invalid {}", label))),
        None => Ok(None),
    }
}

fn validate_rfc3339(label: &str, value: &str) -> Result<String> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc).to_rfc3339())
        .map_err(|_| AppError::BadRequest(format!("{} must be an ISO-8601 timestamp", label)))
}

fn ensure_date_order(starts_at: &str, ends_at: &str) -> Result<()> {
    let starts_at = DateTime::parse_from_rfc3339(starts_at)
        .map_err(|_| AppError::BadRequest("starts_at must be an ISO-8601 timestamp".into()))?;
    let ends_at = DateTime::parse_from_rfc3339(ends_at)
        .map_err(|_| AppError::BadRequest("ends_at must be an ISO-8601 timestamp".into()))?;
    if ends_at <= starts_at {
        return Err(AppError::BadRequest(
            "ends_at must be after starts_at".into(),
        ));
    }
    Ok(())
}

fn parse_range(value: Option<&str>) -> Result<CampaignRange> {
    match value.unwrap_or("30d") {
        "7d" => Ok(CampaignRange::Days7),
        "30d" => Ok(CampaignRange::Days30),
        "90d" => Ok(CampaignRange::Days90),
        _ => Err(AppError::BadRequest(
            "range must be one of 7d, 30d, or 90d".into(),
        )),
    }
}

fn active_campaign_filter(now: DateTime<Utc>) -> (String, String) {
    q(
        "and",
        format!(
            "(starts_at.lte.{},ends_at.gt.{},status.eq.active)",
            now.to_rfc3339(),
            now.to_rfc3339()
        ),
    )
}

fn campaign_is_active(row: &Value) -> bool {
    if value_str(row, "status") != "active" {
        return false;
    }
    let now = Utc::now();
    let starts_at = DateTime::parse_from_rfc3339(value_str(row, "starts_at"))
        .map(|date| date.with_timezone(&Utc) <= now)
        .unwrap_or(false);
    let ends_at = DateTime::parse_from_rfc3339(value_str(row, "ends_at"))
        .map(|date| date.with_timezone(&Utc) > now)
        .unwrap_or(false);
    starts_at && ends_at
}

fn event_date(row: &Value) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(value_str(row, "created_at"))
        .ok()
        .map(|value| value.date_naive())
}

fn safe_rate(numerator: i64, denominator: i64) -> f64 {
    if denominator <= 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

fn ensure_owner_authorized(owner_id: &str, auth_user: &AuthUser) -> Result<()> {
    if auth_user.role == "admin" || owner_id == auth_user.id {
        return Ok(());
    }

    Err(AppError::Forbidden("Not the business owner".into()))
}

fn ensure_business_owner(row: &Value, auth_user: &AuthUser) -> Result<()> {
    if auth_user.role != "business_owner" && auth_user.role != "admin" {
        return Err(AppError::Forbidden(
            "Business owner account required".into(),
        ));
    }
    ensure_owner_authorized(value_str(row, "owner_id"), auth_user)
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

async fn find_campaign(state: &AppState, id: &str) -> Result<Value> {
    let id = security::validate_uuid_id(id, "campaign ID")?;
    state
        .db
        .supabase
        .select_one_json("campaigns", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Campaign not found".into()))
}

async fn find_campaign_claim(state: &AppState, id: &str) -> Result<Value> {
    let id = security::validate_uuid_id(id, "campaign claim ID")?;
    state
        .db
        .supabase
        .select_one_json("campaign_claims", &[select_all(), eq("id", id)])
        .await?
        .ok_or_else(|| AppError::NotFound("Campaign claim not found".into()))
}

fn normalize_campaign(mut row: Value) -> Value {
    if let Some(id) = row.get("id").cloned() {
        row["_id"] = id;
    }
    if row.get("targeting").is_none() {
        row["targeting"] = json!({ "audience": "all_visitors" });
    }
    if row.get("metadata").is_none() {
        row["metadata"] = json!({});
    }
    if row.get("affects_lvs").is_none() {
        row["affects_lvs"] = json!(false);
    }
    row
}

fn generate_claim_code() -> String {
    let suffix: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(6)
        .map(char::from)
        .map(|value| value.to_ascii_uppercase())
        .collect();
    format!("CAM-{}", suffix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::auth::AuthUser;
    use chrono::{DateTime, Utc};
    use serde_json::json;

    #[test]
    fn campaign_type_allowlist_rejects_sponsored_inventory() {
        assert!(validate_campaign_type("slow_hour").is_ok());
        assert!(validate_campaign_type("first_time_visitor").is_ok());
        assert!(validate_campaign_type("event_promotion").is_ok());
        assert!(validate_campaign_type("limited_time_perk").is_ok());
        assert!(validate_campaign_type("non_discount").is_ok());
        assert!(validate_campaign_type("custom_template").is_ok());
        assert!(validate_campaign_type("sponsored_card").is_err());
        assert!(validate_campaign_type("paid_rank_boost").is_err());
    }

    #[test]
    fn campaign_claim_body_never_affects_visibility_score() {
        let claimed_at = DateTime::parse_from_rfc3339("2026-06-06T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let user = auth_user("11111111-1111-4111-8111-111111111111", "customer");
        let campaign = json!({
            "id": "22222222-2222-4222-8222-222222222222",
            "business_id": "33333333-3333-4333-8333-333333333333",
            "ends_at": "2026-06-12T12:00:00Z"
        });

        let body = build_campaign_claim_body(&campaign, &user, claimed_at).unwrap();

        assert_eq!(body["affects_lvs"], false);
        assert_eq!(body["status"], "claimed");
        assert_eq!(body["expires_at"], "2026-06-12T12:00:00Z");
    }

    #[test]
    fn campaign_payload_defaults_targeting_to_all_visitors() {
        let starts_at = (Utc::now() + Duration::days(1)).to_rfc3339();
        let ends_at = (Utc::now() + Duration::days(2)).to_rfc3339();
        let payload = CampaignCreate {
            title: "Slow lunch perk".into(),
            description: "A quiet-hour add-on for nearby customers.".into(),
            campaign_type: "slow_hour".into(),
            offer_kind: Some("perk".into()),
            discount_type: None,
            discount_value: None,
            perk_description: Some("Free pastry with coffee".into()),
            starts_at: Some(starts_at),
            ends_at,
            status: None,
            targeting: None,
            template_id: None,
            linked_event_id: None,
            claim_limit: None,
            per_user_limit: None,
            metadata: None,
        };

        let body = build_campaign_body(
            "33333333-3333-4333-8333-333333333333",
            "11111111-1111-4111-8111-111111111111",
            payload,
        )
        .unwrap();

        assert_eq!(body["targeting"]["audience"], "all_visitors");
        assert_eq!(body["affects_lvs"], false);
        assert_eq!(body["status"], "scheduled");
    }

    #[test]
    fn campaign_performance_aggregates_counts_and_rates() {
        let campaigns = vec![
            json!({
                "id": "22222222-2222-4222-8222-222222222222",
                "title": "Slow lunch perk",
                "campaign_type": "slow_hour",
                "status": "active"
            }),
            json!({
                "id": "44444444-4444-4444-8444-444444444444",
                "title": "Event night",
                "campaign_type": "event_promotion",
                "status": "active"
            }),
        ];
        let events = vec![
            event(
                "campaign_impression",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-01T10:00:00Z",
            ),
            event(
                "campaign_impression",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-01T11:00:00Z",
            ),
            event(
                "campaign_open",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-01T12:00:00Z",
            ),
            event(
                "campaign_claim",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-02T10:00:00Z",
            ),
            event(
                "campaign_directions_click",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-02T11:00:00Z",
            ),
            event(
                "campaign_redemption_placeholder",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-03T10:00:00Z",
            ),
            event(
                "check_in_placeholder",
                "22222222-2222-4222-8222-222222222222",
                "2026-06-03T10:15:00Z",
            ),
            event("check_in_placeholder", "", "2026-06-03T10:30:00Z"),
            event(
                "campaign_impression",
                "44444444-4444-4444-8444-444444444444",
                "2026-06-03T11:00:00Z",
            ),
        ];

        let performance = build_campaign_performance(
            "33333333-3333-4333-8333-333333333333",
            CampaignRange::Days30,
            &campaigns,
            &events,
        );

        assert_eq!(performance.totals.impressions, 3);
        assert_eq!(performance.totals.opens, 1);
        assert_eq!(performance.totals.claims, 1);
        assert_eq!(performance.totals.directions_clicks, 1);
        assert_eq!(performance.totals.check_ins, 1);
        assert_eq!(performance.totals.redemption_placeholders, 1);
        assert_eq!(performance.rates.open_rate, 1.0 / 3.0);
        assert_eq!(performance.rates.claim_rate, 1.0);
        assert_eq!(
            performance.top_campaigns[0].campaign_id,
            "22222222-2222-4222-8222-222222222222"
        );
        assert_eq!(performance.buckets.len(), 3);
    }

    #[test]
    fn owner_authorization_allows_owner_or_admin_only() {
        let owner = auth_user("11111111-1111-4111-8111-111111111111", "business_owner");
        let other = auth_user("22222222-2222-4222-8222-222222222222", "business_owner");
        let admin = auth_user("33333333-3333-4333-8333-333333333333", "admin");

        assert!(ensure_owner_authorized("11111111-1111-4111-8111-111111111111", &owner).is_ok());
        assert!(ensure_owner_authorized("11111111-1111-4111-8111-111111111111", &admin).is_ok());
        assert!(ensure_owner_authorized("11111111-1111-4111-8111-111111111111", &other).is_err());
    }

    fn event(event_type: &str, campaign_id: &str, created_at: &str) -> serde_json::Value {
        json!({
            "event_type": event_type,
            "campaign_id": campaign_id,
            "created_at": created_at
        })
    }

    fn auth_user(id: &str, role: &str) -> AuthUser {
        AuthUser {
            id: id.into(),
            email: "user@example.com".into(),
            name: "User".into(),
            role: role.into(),
        }
    }
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deal {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub business_id: String,
    pub title: String,
    pub description: Option<String>,
    pub discount_percent: Option<f64>,
    pub original_price: Option<f64>,
    pub deal_price: Option<f64>,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct DealCreate {
    pub business_id: String,
    #[validate(length(min = 1, max = 200))]
    pub title: String,
    #[validate(length(max = 1000))]
    pub description: Option<String>,
    #[validate(range(min = 0.0, max = 100.0))]
    pub discount_percent: Option<f64>,
    pub original_price: Option<f64>,
    pub deal_price: Option<f64>,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct DealUpdate {
    pub title: Option<String>,
    pub description: Option<String>,
    pub discount_percent: Option<f64>,
    pub original_price: Option<f64>,
    pub deal_price: Option<f64>,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
    pub is_active: Option<bool>,
}

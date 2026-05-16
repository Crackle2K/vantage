use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    CheckIn,
    Review,
    Deal,
    OwnerPost,
    Claim,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityFeedItem {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub activity_type: ActivityType,
    pub business_id: String,
    pub business_name: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub content: Option<String>,
    pub rating: Option<f32>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckIn {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub business_id: String,
    pub user_id: String,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub is_geo_verified: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CheckInCreate {
    pub business_id: String,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnerPost {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub business_id: String,
    pub owner_id: String,
    pub content: String,
    pub image_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct OwnerPostCreate {
    pub business_id: String,
    pub content: String,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCredibility {
    pub user_id: String,
    pub score: f64,
    pub tier: String,
    pub check_in_count: i32,
    pub review_count: i32,
    pub helpful_votes: i32,
    pub updated_at: DateTime<Utc>,
}

pub fn credibility_tier(score: f64) -> &'static str {
    match score as u32 {
        0..=9 => "NEW",
        10..=24 => "REGULAR",
        25..=49 => "TRUSTED",
        50..=79 => "LOCAL_GUIDE",
        _ => "AMBASSADOR",
    }
}

pub fn calculate_credibility_score(check_ins: i32, reviews: i32, helpful: i32) -> f64 {
    let base = (check_ins as f64 * 1.0) + (reviews as f64 * 3.0) + (helpful as f64 * 0.5);
    base.min(100.0)
}

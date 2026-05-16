use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub business_id: String,
    pub user_id: String,
    pub rating: f32,
    pub comment: Option<String>,
    pub is_verified: bool,
    pub credibility_weight: f64,
    pub helpful_count: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ReviewCreate {
    pub business_id: String,
    #[validate(range(min = 1.0, max = 5.0))]
    pub rating: f32,
    #[validate(length(max = 2000))]
    pub comment: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ReviewUpdate {
    #[validate(range(min = 1.0, max = 5.0))]
    pub rating: Option<f32>,
    #[validate(length(max = 2000))]
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewWithUser {
    #[serde(flatten)]
    pub review: Review,
    pub user_name: Option<String>,
    pub user_picture: Option<String>,
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Customer,
    BusinessOwner,
    Admin,
}

impl Default for UserRole {
    fn default() -> Self {
        UserRole::Customer
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PricePreference {
    Budget,
    Moderate,
    Upscale,
    Any,
}

impl Default for PricePreference {
    fn default() -> Self {
        PricePreference::Any
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryMode {
    Hyperlocal,
    Neighborhood,
    Citywide,
}

impl Default for DiscoveryMode {
    fn default() -> Self {
        DiscoveryMode::Neighborhood
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserPreferences {
    pub categories: Vec<String>,
    pub price_preference: PricePreference,
    pub discovery_mode: DiscoveryMode,
    pub max_distance_km: Option<f64>,
    pub show_verified_only: bool,
    pub show_open_now: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub email: String,
    pub full_name: Option<String>,
    pub role: UserRole,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub preferences: UserPreferences,
    pub stripe_customer_id: Option<String>,
    pub subscription_tier: Option<String>,
    pub google_id: Option<String>,
    pub profile_picture: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UserCreate {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
    pub full_name: Option<String>,
    pub role: Option<UserRole>,
    pub recaptcha_token: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UserLogin {
    #[validate(email)]
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct Token {
    pub access_token: String,
    pub token_type: String,
    pub user: UserPublic,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenClaims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserPublic {
    pub id: String,
    pub email: String,
    pub full_name: Option<String>,
    pub role: UserRole,
    pub profile_picture: Option<String>,
    pub subscription_tier: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GoogleAuthRequest {
    pub credential: String,
}

#[derive(Debug, Deserialize)]
pub struct UserPreferencesUpdate {
    pub categories: Option<Vec<String>>,
    pub price_preference: Option<PricePreference>,
    pub discovery_mode: Option<DiscoveryMode>,
    pub max_distance_km: Option<f64>,
    pub show_verified_only: Option<bool>,
    pub show_open_now: Option<bool>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct PasswordChange {
    pub current_password: String,
    #[validate(length(min = 8))]
    pub new_password: String,
}

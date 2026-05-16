use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SubscriptionTier {
    Free,
    Starter,
    Pro,
    Premium,
}

impl Default for SubscriptionTier {
    fn default() -> Self {
        SubscriptionTier::Free
    }
}

impl SubscriptionTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            SubscriptionTier::Free => "FREE",
            SubscriptionTier::Starter => "STARTER",
            SubscriptionTier::Pro => "PRO",
            SubscriptionTier::Premium => "PREMIUM",
        }
    }

    pub fn monthly_price_usd(&self) -> f64 {
        match self {
            SubscriptionTier::Free => 0.0,
            SubscriptionTier::Starter => 9.99,
            SubscriptionTier::Pro => 29.99,
            SubscriptionTier::Premium => 79.99,
        }
    }

    pub fn max_deals(&self) -> Option<u32> {
        match self {
            SubscriptionTier::Free => Some(1),
            SubscriptionTier::Starter => Some(5),
            SubscriptionTier::Pro => Some(20),
            SubscriptionTier::Premium => None,
        }
    }

    pub fn analytics_access(&self) -> bool {
        matches!(self, SubscriptionTier::Pro | SubscriptionTier::Premium)
    }

    pub fn visibility_boost(&self) -> bool {
        matches!(self, SubscriptionTier::Pro | SubscriptionTier::Premium)
    }

    pub fn featured_placement(&self) -> bool {
        matches!(self, SubscriptionTier::Premium)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub user_id: String,
    pub business_id: Option<String>,
    pub tier: SubscriptionTier,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    pub stripe_price_id: Option<String>,
    pub status: String,
    pub current_period_start: Option<DateTime<Utc>>,
    pub current_period_end: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SubscriptionCreate {
    pub tier: SubscriptionTier,
    pub business_id: Option<String>,
    pub price_id: String,
    pub payment_method_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SubscriptionUpdate {
    pub tier: Option<SubscriptionTier>,
    pub price_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TierInfo {
    pub tier: String,
    pub name: String,
    pub price_usd: f64,
    pub max_deals: Option<u32>,
    pub analytics: bool,
    pub visibility_boost: bool,
    pub featured: bool,
}

pub fn all_tier_infos() -> Vec<TierInfo> {
    vec![
        TierInfo {
            tier: "FREE".into(),
            name: "Free".into(),
            price_usd: 0.0,
            max_deals: Some(1),
            analytics: false,
            visibility_boost: false,
            featured: false,
        },
        TierInfo {
            tier: "STARTER".into(),
            name: "Starter".into(),
            price_usd: 9.99,
            max_deals: Some(5),
            analytics: false,
            visibility_boost: false,
            featured: false,
        },
        TierInfo {
            tier: "PRO".into(),
            name: "Pro".into(),
            price_usd: 29.99,
            max_deals: Some(20),
            analytics: true,
            visibility_boost: true,
            featured: false,
        },
        TierInfo {
            tier: "PREMIUM".into(),
            name: "Premium".into(),
            price_usd: 79.99,
            max_deals: None,
            analytics: true,
            visibility_boost: true,
            featured: true,
        },
    ]
}

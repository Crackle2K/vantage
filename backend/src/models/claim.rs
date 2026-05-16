use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VerificationMethod {
    EmailDomain,
    PhoneCall,
    Document,
    InPerson,
    Community,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ClaimStatus {
    Pending,
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessClaim {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub business_id: String,
    pub user_id: String,
    pub verification_method: VerificationMethod,
    pub status: ClaimStatus,
    pub notes: Option<String>,
    pub reviewed_by: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ClaimCreate {
    pub business_id: String,
    pub verification_method: VerificationMethod,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ClaimReview {
    pub status: ClaimStatus,
    pub notes: Option<String>,
}

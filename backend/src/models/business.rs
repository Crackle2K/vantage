use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Restaurant,
    Cafe,
    Bar,
    Bakery,
    GroceryStore,
    Pharmacy,
    Gym,
    Salon,
    Barbershop,
    Spa,
    Bookstore,
    ClothingStore,
    ElectronicsStore,
    HardwareStore,
    PetStore,
    FlowerShop,
    JewelryStore,
    ArtGallery,
    MusicStore,
    SportingGoods,
    ToyStore,
    AutoRepair,
    Laundry,
    Dentist,
    DoctorOffice,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    #[serde(rename = "type")]
    pub geo_type: String,
    pub coordinates: [f64; 2], // [longitude, latitude]
}

impl GeoLocation {
    pub fn new(lat: f64, lng: f64) -> Self {
        GeoLocation {
            geo_type: "Point".to_string(),
            coordinates: [lng, lat],
        }
    }

    pub fn lat(&self) -> f64 {
        self.coordinates[1]
    }

    pub fn lng(&self) -> f64 {
        self.coordinates[0]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessHours {
    pub monday: Option<String>,
    pub tuesday: Option<String>,
    pub wednesday: Option<String>,
    pub thursday: Option<String>,
    pub friday: Option<String>,
    pub saturday: Option<String>,
    pub sunday: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Business {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub category: Option<String>,
    pub address: String,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip_code: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub location: Option<GeoLocation>,
    pub hours: Option<BusinessHours>,
    pub is_verified: bool,
    pub is_claimed: bool,
    pub owner_id: Option<String>,
    pub google_place_id: Option<String>,
    pub rating: Option<f64>,
    pub review_count: i32,
    pub price_level: Option<i32>,
    pub photos: Vec<String>,
    pub known_for: Vec<String>,
    pub visibility_score: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Distance injected at query time (not stored)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_km: Option<f64>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct BusinessCreate {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    pub category: Option<String>,
    #[validate(length(min = 1))]
    pub address: String,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip_code: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct BusinessUpdate {
    pub name: Option<String>,
    pub category: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip_code: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub description: Option<String>,
    pub hours: Option<BusinessHours>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct BusinessSearchQuery {
    pub q: Option<String>,
    pub category: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub radius_km: Option<f64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub verified_only: Option<bool>,
    pub open_now: Option<bool>,
    pub sort: Option<String>,
}

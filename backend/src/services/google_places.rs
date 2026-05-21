use anyhow::Result;
use serde_json::Value;

const PLACES_API: &str = "https://maps.googleapis.com/maps/api/place";
const GOOGLE_HTTP_TIMEOUT_SECS: u64 = 10;

pub async fn search_nearby(
    api_key: &str,
    lat: f64,
    lng: f64,
    radius_m: u32,
    keyword: Option<&str>,
) -> Result<Vec<Value>> {
    let mut url = format!(
        "{}/nearbysearch/json?location={},{}&radius={}&key={}",
        PLACES_API, lat, lng, radius_m, api_key
    );

    if let Some(kw) = keyword {
        url.push_str(&format!("&keyword={}", urlencoding::encode(kw)));
    }

    let resp = get_google_json(&url).await?;

    let results = resp["results"].as_array().cloned().unwrap_or_default();

    Ok(results)
}

pub async fn get_place_details(api_key: &str, place_id: &str) -> Result<Value> {
    let url = format!(
        "{}/details/json?place_id={}&fields=name,formatted_address,geometry,rating,user_ratings_total,opening_hours,photos,price_level,website,formatted_phone_number&key={}",
        PLACES_API, place_id, api_key
    );

    let resp = get_google_json(&url).await?;
    Ok(resp["result"].clone())
}

pub async fn reverse_geocode(api_key: &str, lat: f64, lng: f64) -> Result<Value> {
    let url = format!(
        "https://maps.googleapis.com/maps/api/geocode/json?latlng={},{}&key={}",
        lat, lng, api_key
    );

    get_google_json(&url).await
}

pub async fn get_photo_url(api_key: &str, photo_reference: &str, max_width: u32) -> String {
    format!(
        "{}/photo?maxwidth={}&photo_reference={}&key={}",
        PLACES_API, max_width, photo_reference, api_key
    )
}

pub fn google_http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(GOOGLE_HTTP_TIMEOUT_SECS))
        .build()?)
}

async fn get_google_json(url: &str) -> Result<Value> {
    let resp = google_http_client()?.get(url).send().await?;
    let status = resp.status();
    let data: Value = resp.json().await?;
    if !status.is_success() {
        anyhow::bail!("Google API request failed with HTTP {}", status.as_u16());
    }
    Ok(data)
}

/// Map a Google Places type to our internal category.
pub fn map_place_type(types: &[String]) -> &'static str {
    for t in types {
        match t.as_str() {
            "restaurant" | "food" => return "restaurant",
            "cafe" | "coffee_shop" => return "cafe",
            "bar" | "night_club" => return "bar",
            "bakery" => return "bakery",
            "grocery_or_supermarket" | "supermarket" => return "grocery_store",
            "pharmacy" | "drugstore" => return "pharmacy",
            "gym" | "health" => return "gym",
            "hair_care" | "beauty_salon" => return "salon",
            "spa" => return "spa",
            "book_store" => return "bookstore",
            "clothing_store" => return "clothing_store",
            "electronics_store" => return "electronics_store",
            "hardware_store" => return "hardware_store",
            "pet_store" => return "pet_store",
            "florist" => return "flower_shop",
            "jewelry_store" => return "jewelry_store",
            "art_gallery" => return "art_gallery",
            "dentist" => return "dentist",
            "doctor" => return "doctor_office",
            "car_repair" => return "auto_repair",
            "laundry" => return "laundry",
            _ => {}
        }
    }
    "other"
}

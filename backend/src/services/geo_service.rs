/// Haversine distance in kilometres between two lat/lng points.
pub fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const R: f64 = 6371.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    2.0 * R * a.sqrt().asin()
}

/// Encode a lat/lng pair into a geo cell string at the given precision.
pub fn geo_cell(lat: f64, lng: f64, precision: u32) -> String {
    let factor = 10_f64.powi(precision as i32);
    let cell_lat = (lat * factor).floor() / factor;
    let cell_lng = (lng * factor).floor() / factor;
    format!("{:.prec$}:{:.prec$}", cell_lat, cell_lng, prec = precision as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_haversine_same_point() {
        assert!(haversine_km(37.77, -122.42, 37.77, -122.42) < 0.001);
    }

    #[test]
    fn test_haversine_known_distance() {
        // SF to Oakland ≈ 13km
        let d = haversine_km(37.7749, -122.4194, 37.8044, -122.2712);
        assert!((d - 13.0).abs() < 1.5);
    }
}

//! Minimal HS256 JWT verifier using pure-Rust HMAC-SHA256.
//! Supabase signs project access tokens with the project's JWT secret.
use crate::errors::AppError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use serde::de::DeserializeOwned;
use serde_json::Value;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn b64(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

fn sign(secret: &[u8], msg: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(msg.as_bytes());
    b64(&mac.finalize().into_bytes())
}

pub fn decode<T: DeserializeOwned>(token: &str, secret: &str) -> crate::errors::Result<T> {
    if secret.trim().is_empty() {
        return Err(AppError::Unauthorized(
            "Supabase JWT secret is not configured".into(),
        ));
    }

    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AppError::Unauthorized("Malformed JWT".into()));
    }

    let header_bytes = URL_SAFE_NO_PAD
        .decode(parts[0])
        .map_err(|_| AppError::Unauthorized("Invalid JWT header".into()))?;
    let header: Value = serde_json::from_slice(&header_bytes)
        .map_err(|_| AppError::Unauthorized("Invalid JWT header".into()))?;
    if header.get("alg").and_then(Value::as_str) != Some("HS256") {
        return Err(AppError::Unauthorized(
            "Unsupported JWT signing algorithm".into(),
        ));
    }

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let expected_sig = sign(secret.as_bytes(), &signing_input);

    // Constant-time comparison
    if !constant_time_eq(parts[2].as_bytes(), expected_sig.as_bytes()) {
        return Err(AppError::Unauthorized("Invalid JWT signature".into()));
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| AppError::Unauthorized("Invalid JWT encoding".into()))?;

    let claims: Value = serde_json::from_slice(&payload_bytes)
        .map_err(|e| AppError::Unauthorized(format!("Invalid JWT claims: {}", e)))?;

    let exp = claims
        .get("exp")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::Unauthorized("JWT is missing expiry".into()))?;
    let now = chrono::Utc::now().timestamp();
    if exp < now {
        return Err(AppError::Unauthorized("Token expired".into()));
    }

    serde_json::from_value(claims)
        .map_err(|e| AppError::Unauthorized(format!("Invalid JWT claims: {}", e)))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::user::SupabaseJwtClaims;
    use serde_json::json;

    fn encode_for_test(payload: Value, secret: &str) -> String {
        let header = b64(br#"{"alg":"HS256","typ":"JWT"}"#);
        let payload = b64(payload.to_string().as_bytes());
        let signing_input = format!("{}.{}", header, payload);
        let sig = sign(secret.as_bytes(), &signing_input);
        format!("{}.{}", signing_input, sig)
    }

    #[test]
    fn decodes_supabase_claims_with_app_role() {
        let secret = "test-supabase-jwt-secret";
        let token = encode_for_test(
            json!({
                "sub": "550e8400-e29b-41d4-a716-446655440000",
                "email": "owner@example.com",
                "exp": chrono::Utc::now().timestamp() + 60,
                "iat": chrono::Utc::now().timestamp(),
                "app_metadata": { "role": "business_owner" },
                "user_metadata": {}
            }),
            secret,
        );

        let claims: SupabaseJwtClaims = decode(&token, secret).unwrap();
        assert_eq!(claims.email.as_deref(), Some("owner@example.com"));
        assert_eq!(claims.app_metadata["role"], "business_owner");
    }

    #[test]
    fn rejects_unsigned_or_wrong_secret_tokens() {
        let token = encode_for_test(
            json!({
                "sub": "550e8400-e29b-41d4-a716-446655440000",
                "exp": chrono::Utc::now().timestamp() + 60
            }),
            "one-secret",
        );

        assert!(decode::<SupabaseJwtClaims>(&token, "another-secret").is_err());
    }
}

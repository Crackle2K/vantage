//! Minimal HS256 JWT implementation using pure-Rust HMAC-SHA256.
//! No ring dependency required.
use crate::{errors::AppError, models::user::TokenClaims};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const HEADER: &str = r#"{"alg":"HS256","typ":"JWT"}"#;

fn b64(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

fn sign(secret: &[u8], msg: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(msg.as_bytes());
    b64(&mac.finalize().into_bytes())
}

pub fn encode(claims: &TokenClaims, secret: &str) -> crate::errors::Result<String> {
    let header = b64(HEADER.as_bytes());
    let payload = b64(serde_json::to_string(claims)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .as_bytes());
    let signing_input = format!("{}.{}", header, payload);
    let sig = sign(secret.as_bytes(), &signing_input);
    Ok(format!("{}.{}", signing_input, sig))
}

pub fn decode(token: &str, secret: &str) -> crate::errors::Result<TokenClaims> {
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AppError::Unauthorized("Malformed JWT".into()));
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

    let claims: TokenClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| AppError::Unauthorized(format!("Invalid JWT claims: {}", e)))?;

    // Check expiry
    let now = chrono::Utc::now().timestamp();
    if claims.exp < now {
        return Err(AppError::Unauthorized("Token expired".into()));
    }

    Ok(claims)
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

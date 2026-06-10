//! JWT verification for Supabase access tokens.
//!
//! Supabase signs project access tokens either with the legacy shared HS256
//! secret or, by default for new projects, an asymmetric ES256 (ECDSA P-256)
//! signing key whose public half is published via JWKS. This module verifies
//! both. HS256 uses pure-Rust HMAC-SHA256; ES256 uses ring's ECDSA verifier.
use crate::errors::AppError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use ring::signature::{UnparsedPublicKey, ECDSA_P256_SHA256_FIXED};
use serde::de::DeserializeOwned;
use serde_json::Value;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// JOSE header fields needed to dispatch verification.
pub struct JwtHeader {
    pub alg: String,
    pub kid: Option<String>,
}

fn b64encode(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

fn b64decode(input: &str) -> Result<Vec<u8>, AppError> {
    URL_SAFE_NO_PAD
        .decode(input)
        .map_err(|_| AppError::Unauthorized("Invalid JWT encoding".into()))
}

fn split(token: &str) -> Result<[&str; 3], AppError> {
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AppError::Unauthorized("Malformed JWT".into()));
    }
    Ok([parts[0], parts[1], parts[2]])
}

/// Reads the JOSE header without verifying the signature, so the caller can
/// pick the verification algorithm and locate the signing key by `kid`.
pub fn decode_header(token: &str) -> Result<JwtHeader, AppError> {
    let [header_b64, _, _] = split(token)?;
    let header: Value = serde_json::from_slice(&b64decode(header_b64)?)
        .map_err(|_| AppError::Unauthorized("Invalid JWT header".into()))?;
    let alg = header
        .get("alg")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Unauthorized("JWT header missing alg".into()))?
        .to_string();
    let kid = header
        .get("kid")
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok(JwtHeader { alg, kid })
}

#[cfg(test)]
fn hs256_sign(secret: &[u8], msg: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(msg.as_bytes());
    b64encode(&mac.finalize().into_bytes())
}

/// Verifies a legacy HS256 (shared-secret) Supabase token.
pub fn verify_hs256<T: DeserializeOwned>(token: &str, secret: &str) -> crate::errors::Result<T> {
    if secret.trim().is_empty() {
        return Err(AppError::Unauthorized(
            "Supabase JWT secret is not configured".into(),
        ));
    }

    let [header_b64, payload_b64, sig_b64] = split(token)?;
    let signing_input = format!("{}.{}", header_b64, payload_b64);
    let signature = b64decode(sig_b64)?;

    // HMAC's verify_slice performs a constant-time comparison.
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(signing_input.as_bytes());
    if mac.verify_slice(&signature).is_err() {
        return Err(AppError::Unauthorized("Invalid JWT signature".into()));
    }

    parse_claims(payload_b64)
}

/// Verifies an ES256 (ECDSA P-256) Supabase token against the public key
/// coordinates taken from the project JWKS. `x_b64url` and `y_b64url` are the
/// base64url-encoded 32-byte curve coordinates published in the JWK.
pub fn verify_es256<T: DeserializeOwned>(
    token: &str,
    x_b64url: &str,
    y_b64url: &str,
) -> crate::errors::Result<T> {
    let [header_b64, payload_b64, sig_b64] = split(token)?;
    let signing_input = format!("{}.{}", header_b64, payload_b64);
    let signature = b64decode(sig_b64)?;

    // ring expects the uncompressed SEC1 point: 0x04 || X || Y (65 bytes).
    let x = b64decode(x_b64url)?;
    let y = b64decode(y_b64url)?;
    if x.len() != 32 || y.len() != 32 {
        return Err(AppError::Unauthorized("Invalid EC public key".into()));
    }
    let mut public_key = Vec::with_capacity(65);
    public_key.push(0x04);
    public_key.extend_from_slice(&x);
    public_key.extend_from_slice(&y);

    UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, &public_key)
        .verify(signing_input.as_bytes(), &signature)
        .map_err(|_| AppError::Unauthorized("Invalid JWT signature".into()))?;

    parse_claims(payload_b64)
}

/// Decodes the payload, enforces expiry, and deserializes the claims.
fn parse_claims<T: DeserializeOwned>(payload_b64: &str) -> crate::errors::Result<T> {
    let claims: Value = serde_json::from_slice(&b64decode(payload_b64)?)
        .map_err(|e| AppError::Unauthorized(format!("Invalid JWT claims: {}", e)))?;

    let exp = claims
        .get("exp")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::Unauthorized("JWT is missing expiry".into()))?;
    if exp < chrono::Utc::now().timestamp() {
        return Err(AppError::Unauthorized("Token expired".into()));
    }

    serde_json::from_value(claims)
        .map_err(|e| AppError::Unauthorized(format!("Invalid JWT claims: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::user::SupabaseJwtClaims;
    use serde_json::json;

    fn hs256_token(payload: Value, secret: &str) -> String {
        let header = b64encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let payload = b64encode(payload.to_string().as_bytes());
        let signing_input = format!("{}.{}", header, payload);
        let sig = hs256_sign(secret.as_bytes(), &signing_input);
        format!("{}.{}", signing_input, sig)
    }

    #[test]
    fn decodes_supabase_claims_with_app_role() {
        let secret = "test-supabase-jwt-secret";
        let token = hs256_token(
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

        let claims: SupabaseJwtClaims = verify_hs256(&token, secret).unwrap();
        assert_eq!(claims.email.as_deref(), Some("owner@example.com"));
        assert_eq!(claims.app_metadata["role"], "business_owner");
    }

    #[test]
    fn rejects_unsigned_or_wrong_secret_tokens() {
        let token = hs256_token(
            json!({
                "sub": "550e8400-e29b-41d4-a716-446655440000",
                "exp": chrono::Utc::now().timestamp() + 60
            }),
            "one-secret",
        );

        assert!(verify_hs256::<SupabaseJwtClaims>(&token, "another-secret").is_err());
    }

    #[test]
    fn decode_header_reports_alg_and_kid() {
        let header = b64encode(br#"{"alg":"ES256","kid":"key-1","typ":"JWT"}"#);
        let token = format!("{}.{}.{}", header, b64encode(b"{}"), b64encode(b"sig"));

        let parsed = decode_header(&token).unwrap();
        assert_eq!(parsed.alg, "ES256");
        assert_eq!(parsed.kid.as_deref(), Some("key-1"));
    }

    /// Signs a token with a freshly generated P-256 key and verifies it through
    /// the same JWKS-coordinate path used in production.
    #[test]
    fn verifies_es256_token_against_public_coordinates() {
        use ring::rand::SystemRandom;
        use ring::signature::{EcdsaKeyPair, KeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};

        let rng = SystemRandom::new();
        let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng).unwrap();
        let key_pair =
            EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8.as_ref(), &rng)
                .unwrap();

        // public_key() is the uncompressed SEC1 point: 0x04 || X || Y.
        let public = key_pair.public_key().as_ref();
        let x_b64 = b64encode(&public[1..33]);
        let y_b64 = b64encode(&public[33..65]);

        let header = b64encode(br#"{"alg":"ES256","kid":"key-1","typ":"JWT"}"#);
        let payload = b64encode(
            json!({
                "sub": "550e8400-e29b-41d4-a716-446655440000",
                "email": "owner@example.com",
                "exp": chrono::Utc::now().timestamp() + 60,
                "app_metadata": { "role": "customer" },
                "user_metadata": {}
            })
            .to_string()
            .as_bytes(),
        );
        let signing_input = format!("{}.{}", header, payload);
        let sig = key_pair.sign(&rng, signing_input.as_bytes()).unwrap();
        let token = format!("{}.{}", signing_input, b64encode(sig.as_ref()));

        let claims: SupabaseJwtClaims = verify_es256(&token, &x_b64, &y_b64).unwrap();
        assert_eq!(claims.email.as_deref(), Some("owner@example.com"));
        assert_eq!(claims.app_metadata["role"], "customer");

        // A token verified against the wrong coordinates must be rejected.
        let other = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng).unwrap();
        let other_pair =
            EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, other.as_ref(), &rng)
                .unwrap();
        let other_public = other_pair.public_key().as_ref();
        assert!(verify_es256::<SupabaseJwtClaims>(
            &token,
            &b64encode(&other_public[1..33]),
            &b64encode(&other_public[33..65]),
        )
        .is_err());
    }
}

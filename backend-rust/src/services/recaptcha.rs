use crate::config::Config;
use anyhow::{bail, Result};
use serde_json::Value;

pub async fn verify_recaptcha_token(
    config: &Config,
    token: &str,
    expected_action: &str,
) -> Result<()> {
    if config.recaptcha_project_id.is_empty() || config.recaptcha_api_key.is_empty() {
        return Ok(());
    }

    let url = format!(
        "https://recaptchaenterprise.googleapis.com/v1/projects/{}/assessments?key={}",
        config.recaptcha_project_id, config.recaptcha_api_key
    );

    let body = serde_json::json!({
        "event": {
            "token": token,
            "siteKey": config.recaptcha_site_key,
            "expectedAction": expected_action,
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(config.recaptcha_verify_timeout_secs))
        .build()?;

    let resp: Value = client.post(&url).json(&body).send().await?.json().await?;

    let score = resp["riskAnalysis"]["score"]
        .as_f64()
        .or_else(|| resp["score"].as_f64())
        .unwrap_or(0.0);

    let action = resp["tokenProperties"]["action"]
        .as_str()
        .or_else(|| resp["action"].as_str())
        .unwrap_or("");

    if action != expected_action {
        bail!("reCAPTCHA action mismatch: expected {}, got {}", expected_action, action);
    }

    if score < config.recaptcha_min_score {
        bail!("reCAPTCHA score too low: {} < {}", score, config.recaptcha_min_score);
    }

    Ok(())
}

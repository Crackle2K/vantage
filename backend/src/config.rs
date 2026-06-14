use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    // Auth session cookies
    pub refresh_token_expire_days: i64,

    // Google
    pub google_api_key: String,

    // reCAPTCHA Enterprise
    pub recaptcha_project_id: String,
    pub recaptcha_api_key: String,
    pub recaptcha_site_key: String,
    pub recaptcha_signup_action: String,
    pub recaptcha_min_score: f64,
    pub recaptcha_verify_timeout_secs: u64,

    // URLs
    pub api_url: String,
    pub frontend_url: String,
    pub production_url: String,
    pub environment: String,

    // Rate limiting
    pub rate_limit_per_minute: u32,

    // Supabase
    pub supabase_url: String,
    pub supabase_service_role_key: String,
    pub supabase_jwt_secret: String,

    // Stripe
    pub stripe_secret_key: String,
    pub stripe_webhook_secret: String,

    // Misc
    pub demo_mode: bool,
    pub demo_lat: f64,
    pub demo_lng: f64,
}

impl Config {
    pub fn from_env() -> Self {
        Config {
            refresh_token_expire_days: env::var("REFRESH_TOKEN_EXPIRE_DAYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7),

            google_api_key: env::var("GOOGLE_API_KEY").unwrap_or_default(),

            recaptcha_project_id: env::var("RECAPTCHA_ENTERPRISE_PROJECT_ID").unwrap_or_default(),
            recaptcha_api_key: env::var("RECAPTCHA_ENTERPRISE_API_KEY").unwrap_or_default(),
            recaptcha_site_key: env::var("RECAPTCHA_ENTERPRISE_SITE_KEY").unwrap_or_default(),
            recaptcha_signup_action: env::var("RECAPTCHA_SIGNUP_ACTION")
                .unwrap_or_else(|_| "SIGNUP".into()),
            recaptcha_min_score: env::var("RECAPTCHA_MIN_SCORE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.5),
            recaptcha_verify_timeout_secs: env::var("RECAPTCHA_VERIFY_TIMEOUT_SECONDS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),

            api_url: env::var("API_URL").unwrap_or_else(|_| "http://localhost:8000".into()),
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:5173".into()),
            production_url: env::var("PRODUCTION_URL")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .or_else(vercel_deployment_url)
                .unwrap_or_default(),
            environment: normalized_environment(),

            rate_limit_per_minute: env::var("RATE_LIMIT_PER_MINUTE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(120),

            supabase_url: env::var("SUPABASE_URL").unwrap_or_default(),
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default(),
            supabase_jwt_secret: env::var("SUPABASE_JWT_SECRET").unwrap_or_default(),

            stripe_secret_key: env::var("STRIPE_SECRET_KEY").unwrap_or_default(),
            stripe_webhook_secret: env::var("STRIPE_WEBHOOK_SECRET").unwrap_or_default(),

            demo_mode: matches!(
                env::var("DEMO_MODE").as_deref(),
                Ok("1") | Ok("true") | Ok("yes") | Ok("on")
            ),
            demo_lat: env::var("DEMO_LAT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(37.7749),
            demo_lng: env::var("DEMO_LNG")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(-122.4194),
        }
    }

    pub fn is_production(&self) -> bool {
        self.environment == "production"
    }

    pub fn validate(&self) -> anyhow::Result<()> {
        require_configured("SUPABASE_URL", &self.supabase_url)?;
        require_configured("SUPABASE_SERVICE_ROLE_KEY", &self.supabase_service_role_key)?;
        // SUPABASE_JWT_SECRET is optional: it is only used to verify legacy
        // HS256 access tokens. Projects using asymmetric (ES256) signing keys
        // are verified against the published JWKS and need no shared secret.
        if self.refresh_token_expire_days <= 0 {
            anyhow::bail!("REFRESH_TOKEN_EXPIRE_DAYS must be greater than zero");
        }
        if self.is_production() {
            let frontend_origin = if !self.production_url.trim().is_empty() {
                self.production_url.trim()
            } else {
                self.frontend_url.trim()
            };
            require_public_origin("FRONTEND_URL or PRODUCTION_URL", frontend_origin)?;
            if !self.stripe_secret_key.trim().is_empty() {
                require_configured("STRIPE_WEBHOOK_SECRET", &self.stripe_webhook_secret)?;
            }
        }
        Ok(())
    }

    pub fn recaptcha_enabled(&self) -> bool {
        !self.recaptcha_project_id.is_empty()
            && !self.recaptcha_api_key.is_empty()
            && !self.recaptcha_site_key.is_empty()
    }

    pub fn allowed_origins(&self) -> Vec<String> {
        let mut origins = Vec::new();
        if self.is_production() {
            if !self.production_url.trim().is_empty() {
                push_origin(&mut origins, &self.production_url);
            } else {
                push_origin(&mut origins, &self.frontend_url);
            }
        } else {
            push_origin(&mut origins, "http://localhost:5173");
            push_origin(&mut origins, "http://localhost:3000");
            push_origin(&mut origins, "http://localhost:5174");
            push_origin(&mut origins, &self.frontend_url);
            push_origin(&mut origins, &self.production_url);
        }

        if !self.is_production() {
            if let Ok(vercel_url) = env::var("VERCEL_URL") {
                push_origin(
                    &mut origins,
                    format!("https://{}", vercel_url.trim_start_matches("https://")),
                );
            }
        }
        origins
    }
}

fn require_configured(name: &str, value: &str) -> anyhow::Result<()> {
    if value.trim().is_empty() {
        anyhow::bail!("{} environment variable must be set", name);
    }
    Ok(())
}

fn require_public_origin(name: &str, value: &str) -> anyhow::Result<()> {
    require_configured(name, value)?;
    if !(value.starts_with("https://") || value.starts_with("http://")) {
        anyhow::bail!("{} must be an absolute URL", name);
    }
    let lowered = value.to_ascii_lowercase();
    if lowered.contains("localhost") || lowered.contains("127.0.0.1") {
        anyhow::bail!("{} must not point to localhost in production", name);
    }
    Ok(())
}

/// Resolves the public deployment URL from Vercel's built-in environment
/// variables when PRODUCTION_URL is not set explicitly. Prefers the stable
/// production domain over the per-deployment URL.
fn vercel_deployment_url() -> Option<String> {
    env::var("VERCEL_PROJECT_PRODUCTION_URL")
        .or_else(|_| env::var("VERCEL_URL"))
        .ok()
        .map(|v| v.trim().trim_start_matches("https://").to_string())
        .filter(|v| !v.is_empty())
        .map(|v| format!("https://{}", v))
}

fn normalized_environment() -> String {
    let raw = env::var("ENVIRONMENT")
        .or_else(|_| env::var("VERCEL_ENV"))
        .unwrap_or_else(|_| "development".into())
        .to_ascii_lowercase();

    match raw.as_str() {
        "prod" | "production" => "production".into(),
        "preview" | "staging" => "preview".into(),
        _ => "development".into(),
    }
}

fn push_origin(origins: &mut Vec<String>, origin: impl AsRef<str>) {
    let value = origin.as_ref().trim().trim_end_matches('/');
    if value.is_empty() || !(value.starts_with("http://") || value.starts_with("https://")) {
        return;
    }
    let normalized = value.to_string();
    if !origins.contains(&normalized) {
        origins.push(normalized);
    }
}

#[cfg(test)]
mod tests {
    use super::Config;

    fn config(environment: &str, production_url: &str, frontend_url: &str) -> Config {
        Config {
            refresh_token_expire_days: 7,
            google_api_key: String::new(),
            recaptcha_project_id: String::new(),
            recaptcha_api_key: String::new(),
            recaptcha_site_key: String::new(),
            recaptcha_signup_action: "SIGNUP".into(),
            recaptcha_min_score: 0.5,
            recaptcha_verify_timeout_secs: 10,
            api_url: "http://localhost:8000".into(),
            frontend_url: frontend_url.into(),
            production_url: production_url.into(),
            environment: environment.into(),
            rate_limit_per_minute: 120,
            supabase_url: "https://example.supabase.co".into(),
            supabase_service_role_key: "service-role".into(),
            supabase_jwt_secret: "jwt-secret".into(),
            stripe_secret_key: String::new(),
            stripe_webhook_secret: String::new(),
            demo_mode: false,
            demo_lat: 37.7749,
            demo_lng: -122.4194,
        }
    }

    #[test]
    fn production_rejects_localhost_frontend_origin() {
        assert!(config("production", "", "http://localhost:5173")
            .validate()
            .is_err());
    }

    #[test]
    fn production_accepts_public_frontend_origin() {
        assert!(config(
            "production",
            "https://vantage.example",
            "http://localhost:5173"
        )
        .validate()
        .is_ok());
    }

    #[test]
    fn production_requires_stripe_webhook_secret_when_stripe_is_enabled() {
        let mut config = config("production", "https://vantage.example", "");
        config.stripe_secret_key = "sk_live_test".into();
        assert!(config.validate().is_err());

        config.stripe_webhook_secret = "whsec_test".into();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn production_cors_does_not_include_dev_origins() {
        let origins = config("production", "https://vantage.example", "").allowed_origins();

        assert!(!origins.contains(&"http://localhost:5173".to_string()));
        assert_eq!(origins, vec!["https://vantage.example".to_string()]);
    }
}

use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    // JWT
    pub secret_key: String,
    pub algorithm: String,
    pub access_token_expire_minutes: i64,
    pub refresh_token_expire_days: i64,

    // Google
    pub google_api_key: String,
    pub google_client_id: String,
    pub google_client_secret: String,

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

    // Redis
    pub redis_url: String,
    pub rate_limit_per_minute: u32,

    // Supabase
    pub supabase_url: String,
    pub supabase_service_role_key: String,
    pub supabase_jwt_secret: String,

    // Stripe
    pub stripe_secret_key: String,
    pub stripe_publishable_key: String,
    pub stripe_webhook_secret: String,

    // Misc
    pub demo_mode: bool,
    pub demo_lat: f64,
    pub demo_lng: f64,
}

impl Config {
    pub fn from_env() -> Self {
        let secret_key =
            env::var("SECRET_KEY").expect("SECRET_KEY environment variable must be set");

        Config {
            secret_key,
            algorithm: env::var("ALGORITHM").unwrap_or_else(|_| "HS256".into()),
            access_token_expire_minutes: env::var("ACCESS_TOKEN_EXPIRE_MINUTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
            refresh_token_expire_days: env::var("REFRESH_TOKEN_EXPIRE_DAYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7),

            google_api_key: env::var("GOOGLE_API_KEY").unwrap_or_default(),
            google_client_id: env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),

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
            production_url: env::var("PRODUCTION_URL").unwrap_or_default(),
            environment: normalized_environment(),

            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/0".into()),
            rate_limit_per_minute: env::var("RATE_LIMIT_PER_MINUTE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(120),

            supabase_url: env::var("SUPABASE_URL").unwrap_or_default(),
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default(),
            supabase_jwt_secret: env::var("SUPABASE_JWT_SECRET").unwrap_or_default(),

            stripe_secret_key: env::var("STRIPE_SECRET_KEY").unwrap_or_default(),
            stripe_publishable_key: env::var("STRIPE_PUBLISHABLE_KEY").unwrap_or_default(),
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

    pub fn recaptcha_enabled(&self) -> bool {
        !self.recaptcha_project_id.is_empty()
            && !self.recaptcha_api_key.is_empty()
            && !self.recaptcha_site_key.is_empty()
    }

    pub fn allowed_origins(&self) -> Vec<String> {
        let mut origins = Vec::new();
        push_origin(&mut origins, "http://localhost:5173");
        push_origin(&mut origins, "http://localhost:3000");
        push_origin(&mut origins, "http://localhost:5174");
        push_origin(&mut origins, &self.frontend_url);
        push_origin(&mut origins, &self.production_url);

        if let Ok(vercel_url) = env::var("VERCEL_URL") {
            push_origin(
                &mut origins,
                format!("https://{}", vercel_url.trim_start_matches("https://")),
            );
        }
        origins
    }
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

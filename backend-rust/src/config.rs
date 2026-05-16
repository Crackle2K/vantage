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
        let secret_key = env::var("SECRET_KEY")
            .expect("SECRET_KEY environment variable must be set");

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
            environment: env::var("ENVIRONMENT").unwrap_or_else(|_| "development".into()),

            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379/0".into()),

            supabase_url: env::var("SUPABASE_URL").unwrap_or_default(),
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY")
                .unwrap_or_default(),
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

    pub fn allowed_origins(&self) -> Vec<String> {
        let mut origins = vec![
            "http://localhost:5173".to_string(),
            "http://localhost:3000".to_string(),
            "http://localhost:5174".to_string(),
        ];
        if !self.frontend_url.is_empty() {
            origins.push(self.frontend_url.clone());
        }
        if !self.production_url.is_empty() {
            origins.push(self.production_url.clone());
        }
        if let Ok(vercel_url) = env::var("VERCEL_URL") {
            origins.push(format!("https://{}", vercel_url));
            origins.push(format!("https://{}.vercel.app", vercel_url));
        }
        origins
    }
}

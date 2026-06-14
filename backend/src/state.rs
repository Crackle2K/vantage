use crate::{config::Config, db::Database, security::RateLimiter};
use reqwest::Client;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: Database,
    pub rate_limiter: RateLimiter,
    pub google_http: Client,
    pub stripe_http: Client,
    pub recaptcha_http: Client,
}

impl AppState {
    pub fn new(config: Config, db: Database) -> anyhow::Result<Self> {
        Ok(Self {
            google_http: http_client(10)?,
            stripe_http: http_client(15)?,
            recaptcha_http: http_client(config.recaptcha_verify_timeout_secs)?,
            config,
            db,
            rate_limiter: RateLimiter::new(),
        })
    }
}

fn http_client(timeout_secs: u64) -> anyhow::Result<Client> {
    Ok(Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs.max(1)))
        .build()?)
}

use crate::{config::Config, db::Database, security::RateLimiter};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: Database,
    pub rate_limiter: RateLimiter,
}

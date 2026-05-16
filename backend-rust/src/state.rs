use crate::{config::Config, db::Database};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: Database,
}

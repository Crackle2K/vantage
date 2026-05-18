pub mod supabase;

pub use supabase::SupabaseClient;

use crate::config::Config;

#[derive(Clone)]
pub struct Database {
    pub supabase: SupabaseClient,
}

impl Database {
    pub async fn new(config: &Config) -> Self {
        let supabase = SupabaseClient::new(config);
        Database { supabase }
    }
}

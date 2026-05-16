pub mod mongo;
pub mod supabase;

pub use mongo::MongoDb;
pub use supabase::SupabaseClient;

use crate::config::Config;

#[derive(Clone)]
pub struct Database {
    pub mongo: MongoDb,
    pub supabase: SupabaseClient,
}

impl Database {
    pub async fn new(config: &Config) -> Self {
        let mongo = MongoDb::connect(config).await;
        let supabase = SupabaseClient::new(config);
        Database { mongo, supabase }
    }
}

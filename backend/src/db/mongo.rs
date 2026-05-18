use crate::config::Config;
use mongodb::{options::ClientOptions, Client, Database};
use std::time::Duration;

#[derive(Clone)]
pub struct MongoDb {
    pub client: Client,
    pub db_name: String,
}

impl MongoDb {
    pub async fn connect(config: &Config) -> Self {
        let mongo_uri = std::env::var("MONGODB_URI")
            .unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let db_name = std::env::var("MONGODB_DB_NAME").unwrap_or_else(|_| "vantage".to_string());

        let mut opts = match ClientOptions::parse(&mongo_uri).await {
            Ok(opts) => opts,
            Err(error) => {
                tracing::error!(
                    error = %error,
                    "MongoDB URI could not be parsed; falling back to localhost so non-Mongo routes can start"
                );
                ClientOptions::parse("mongodb://localhost:27017")
                    .await
                    .expect("fallback MongoDB URI must parse")
            }
        };

        opts.connect_timeout = Some(Duration::from_secs(10));
        opts.server_selection_timeout = Some(Duration::from_secs(10));

        let client =
            Client::with_options(opts).expect("validated MongoDB options must create a client");

        if config.is_production() {
            tracing::info!("MongoDB client initialized (production)");
        } else {
            tracing::info!("MongoDB client initialized (development)");
        }

        MongoDb { client, db_name }
    }

    pub fn collection<T>(&self, name: &str) -> mongodb::Collection<T>
    where
        T: Send + Sync,
    {
        self.client.database(&self.db_name).collection(name)
    }

    pub fn raw_db(&self) -> Database {
        self.client.database(&self.db_name)
    }
}

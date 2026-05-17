use crate::config::Config;
use anyhow::Result;
use reqwest::Client;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;

#[derive(Clone)]
pub struct SupabaseClient {
    pub url: String,
    pub service_role_key: String,
    pub http: Client,
}

impl SupabaseClient {
    pub fn new(config: &Config) -> Self {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("Failed to build HTTP client");

        SupabaseClient {
            url: config.supabase_url.clone(),
            service_role_key: config.supabase_service_role_key.clone(),
            http,
        }
    }

    fn table_url(&self, table: &str) -> String {
        format!("{}/rest/v1/{}", self.url, table)
    }

    fn auth_headers(&self) -> Vec<(&'static str, String)> {
        vec![
            ("apikey", self.service_role_key.clone()),
            ("Authorization", format!("Bearer {}", self.service_role_key)),
        ]
    }

    pub async fn select<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &[(&str, &str)],
    ) -> Result<Vec<T>> {
        let mut req = self.http.get(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        req = req.header("Accept", "application/json");
        for (k, v) in query {
            req = req.query(&[(k, v)]);
        }
        let resp = req.send().await?;
        let data: Vec<T> = resp.json().await?;
        Ok(data)
    }

    pub async fn select_one<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &[(&str, &str)],
    ) -> Result<Option<T>> {
        let mut results = self.select::<T>(table, query).await?;
        Ok(results.pop())
    }

    pub async fn insert<B: Serialize, T: DeserializeOwned>(
        &self,
        table: &str,
        body: &B,
    ) -> Result<T> {
        let mut req = self.http.post(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        req = req
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(body);
        let resp = req.send().await?;
        let mut rows: Vec<T> = resp.json().await?;
        rows.pop()
            .ok_or_else(|| anyhow::anyhow!("Insert returned no rows"))
    }

    pub async fn update<B: Serialize>(
        &self,
        table: &str,
        filter: &[(&str, &str)],
        body: &B,
    ) -> Result<u64> {
        let mut req = self.http.patch(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        req = req
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal");
        for (k, v) in filter {
            req = req.query(&[(k, v)]);
        }
        req = req.json(body);
        let resp = req.send().await?;
        let count = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split('/').next_back())
            .and_then(|n| n.parse().ok())
            .unwrap_or(0);
        Ok(count)
    }

    pub async fn delete(&self, table: &str, filter: &[(&str, &str)]) -> Result<u64> {
        let mut req = self.http.delete(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        for (k, v) in filter {
            req = req.query(&[(k, v)]);
        }
        let resp = req.send().await?;
        let count = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split('/').next_back())
            .and_then(|n| n.parse().ok())
            .unwrap_or(0);
        Ok(count)
    }

    /// Call Supabase Auth admin API
    pub async fn auth_create_user(&self, email: &str, password: &str) -> Result<Value> {
        let url = format!("{}/auth/v1/admin/users", self.url);
        let body = serde_json::json!({
            "email": email,
            "password": password,
            "email_confirm": true,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .json(&body)
            .send()
            .await?;
        let data: Value = resp.json().await?;
        Ok(data)
    }

    pub async fn auth_delete_user(&self, user_id: &str) -> Result<()> {
        let url = format!("{}/auth/v1/admin/users/{}", self.url, user_id);
        self.http
            .delete(&url)
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .send()
            .await?;
        Ok(())
    }
}

use crate::config::Config;
use anyhow::{bail, Result};
use reqwest::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

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

    pub fn is_configured(&self) -> bool {
        !self.url.trim().is_empty() && !self.service_role_key.trim().is_empty()
    }

    fn ensure_configured(&self) -> Result<()> {
        if !self.is_configured() {
            bail!("Supabase is not configured");
        }
        Ok(())
    }

    async fn parse_json_response(resp: reqwest::Response) -> Result<Value> {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let data: Value =
            serde_json::from_str(&text).unwrap_or_else(|_| json!({ "message": text }));

        if !status.is_success() {
            let message = data["msg"]
                .as_str()
                .or_else(|| data["message"].as_str())
                .or_else(|| data["error_description"].as_str())
                .or_else(|| data["error"].as_str())
                .unwrap_or("Supabase request failed");
            bail!("{} (HTTP {})", message, status.as_u16());
        }

        Ok(data)
    }

    async fn parse_array_response(resp: reqwest::Response) -> Result<Vec<Value>> {
        let data = Self::parse_json_response(resp).await?;
        match data {
            Value::Array(rows) => Ok(rows),
            Value::Null => Ok(Vec::new()),
            other => bail!("Expected Supabase array response, got {}", other),
        }
    }

    pub async fn health_check(&self) -> Result<()> {
        self.ensure_configured()?;
        let _ = self
            .select_json(
                "businesses",
                &[
                    ("select".to_string(), "id".to_string()),
                    ("limit".to_string(), "1".to_string()),
                ],
            )
            .await?;
        Ok(())
    }

    pub async fn select_json(&self, table: &str, query: &[(String, String)]) -> Result<Vec<Value>> {
        self.ensure_configured()?;
        let mut req = self.http.get(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        req = req.header("Accept", "application/json");
        for (k, v) in query {
            req = req.query(&[(k, v)]);
        }
        let resp = req.send().await?;
        Self::parse_array_response(resp).await
    }

    pub async fn select_one_json(
        &self,
        table: &str,
        query: &[(String, String)],
    ) -> Result<Option<Value>> {
        let mut scoped = query.to_vec();
        if !scoped.iter().any(|(k, _)| k == "limit") {
            scoped.push(("limit".to_string(), "1".to_string()));
        }
        let rows = self.select_json(table, &scoped).await?;
        Ok(rows.into_iter().next())
    }

    pub async fn insert_json(&self, table: &str, body: Value) -> Result<Value> {
        self.ensure_configured()?;
        let mut req = self.http.post(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        let resp = req
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await?;
        let rows = Self::parse_array_response(resp).await?;
        rows.into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Insert returned no rows"))
    }

    pub async fn update_json(
        &self,
        table: &str,
        filter: &[(String, String)],
        body: Value,
    ) -> Result<Vec<Value>> {
        self.ensure_configured()?;
        let mut req = self.http.patch(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        for (k, v) in filter {
            req = req.query(&[(k, v)]);
        }
        let resp = req
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await?;
        Self::parse_array_response(resp).await
    }

    pub async fn delete_json(
        &self,
        table: &str,
        filter: &[(String, String)],
    ) -> Result<Vec<Value>> {
        self.ensure_configured()?;
        let mut req = self.http.delete(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        for (k, v) in filter {
            req = req.query(&[(k, v)]);
        }
        let resp = req.header("Prefer", "return=representation").send().await?;
        Self::parse_array_response(resp).await
    }

    pub async fn count(&self, table: &str, filter: &[(String, String)]) -> Result<usize> {
        self.ensure_configured()?;
        let mut req = self
            .http
            .get(self.table_url(table))
            .header("Accept", "application/json")
            .header("Prefer", "count=exact")
            .header("Range-Unit", "items")
            .header("Range", "0-0")
            .query(&[("select", "id")]);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        for (k, v) in filter {
            req = req.query(&[(k, v)]);
        }

        let resp = req.send().await?;
        let status = resp.status();
        if !status.is_success() {
            Self::parse_json_response(resp).await?;
            return Ok(0);
        }

        let count = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|value| value.split('/').next_back())
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);

        Ok(count)
    }

    pub async fn select<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &[(&str, &str)],
    ) -> Result<Vec<T>> {
        self.ensure_configured()?;
        let mut req = self.http.get(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        req = req.header("Accept", "application/json");
        for (k, v) in query {
            req = req.query(&[(k, v)]);
        }
        let resp = req.send().await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
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
        self.ensure_configured()?;
        let mut req = self.http.post(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        req = req
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(body);
        let resp = req.send().await?;
        let data = Self::parse_json_response(resp).await?;
        let mut rows: Vec<T> = serde_json::from_value(data)?;
        rows.pop()
            .ok_or_else(|| anyhow::anyhow!("Insert returned no rows"))
    }

    pub async fn update<B: Serialize>(
        &self,
        table: &str,
        filter: &[(&str, &str)],
        body: &B,
    ) -> Result<u64> {
        self.ensure_configured()?;
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
        let status = resp.status();
        let count = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split('/').next_back())
            .and_then(|n| n.parse().ok())
            .unwrap_or(0);
        if !status.is_success() {
            bail!("Supabase update failed (HTTP {})", status.as_u16());
        }
        Ok(count)
    }

    pub async fn delete(&self, table: &str, filter: &[(&str, &str)]) -> Result<u64> {
        self.ensure_configured()?;
        let mut req = self.http.delete(self.table_url(table));
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        for (k, v) in filter {
            req = req.query(&[(k, v)]);
        }
        let resp = req.send().await?;
        let status = resp.status();
        let count = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split('/').next_back())
            .and_then(|n| n.parse().ok())
            .unwrap_or(0);
        if !status.is_success() {
            bail!("Supabase delete failed (HTTP {})", status.as_u16());
        }
        Ok(count)
    }

    /// Call Supabase Auth admin API
    pub async fn auth_create_user(
        &self,
        email: &str,
        password: &str,
        user_metadata: Value,
        app_metadata: Value,
    ) -> Result<AuthUserRecord> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/admin/users", self.url);
        let body = json!({
            "email": email,
            "password": password,
            "email_confirm": true,
            "user_metadata": user_metadata,
            "app_metadata": app_metadata,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .json(&body)
            .send()
            .await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
    }

    pub async fn auth_login_password(&self, email: &str, password: &str) -> Result<AuthSession> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/token?grant_type=password", self.url);
        let body = json!({
            "email": email,
            "password": password,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.service_role_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
    }

    pub async fn auth_login_id_token(&self, provider: &str, token: &str) -> Result<AuthSession> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/token?grant_type=id_token", self.url);
        let body = json!({
            "provider": provider,
            "token": token,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.service_role_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
    }

    pub async fn auth_refresh_token(&self, refresh_token: &str) -> Result<AuthSession> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/token?grant_type=refresh_token", self.url);
        let body = json!({
            "refresh_token": refresh_token,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.service_role_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
    }

    pub async fn auth_get_user(&self, user_id: &str) -> Result<AuthUserRecord> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/admin/users/{}", self.url, user_id);
        let resp = self
            .http
            .get(&url)
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .send()
            .await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
    }

    pub async fn auth_update_user(&self, user_id: &str, body: Value) -> Result<AuthUserRecord> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/admin/users/{}", self.url, user_id);
        let resp = self
            .http
            .put(&url)
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        let data = Self::parse_json_response(resp).await?;
        serde_json::from_value(data).map_err(Into::into)
    }

    pub async fn auth_delete_user(&self, user_id: &str) -> Result<()> {
        self.ensure_configured()?;
        let url = format!("{}/auth/v1/admin/users/{}", self.url, user_id);
        let resp = self
            .http
            .delete(&url)
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .send()
            .await?;
        Self::parse_json_response(resp).await?;
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthSession {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub user: AuthUserRecord,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthUserRecord {
    pub id: String,
    pub email: Option<String>,
    #[serde(default)]
    pub user_metadata: Value,
    #[serde(default)]
    pub app_metadata: Value,
    pub created_at: Option<String>,
}

use anyhow::Result;
use serde_json::Value;

const STRIPE_API: &str = "https://api.stripe.com/v1";

async fn stripe_post(secret_key: &str, path: &str, params: &[(&str, &str)]) -> Result<Value> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}{}", STRIPE_API, path))
        .basic_auth(secret_key, Option::<&str>::None)
        .form(params)
        .send()
        .await?;

    let data: Value = resp.json().await?;
    if let Some(err) = data.get("error") {
        anyhow::bail!(
            "Stripe error: {}",
            err["message"].as_str().unwrap_or("unknown")
        );
    }
    Ok(data)
}

async fn stripe_delete(secret_key: &str, path: &str) -> Result<Value> {
    let client = reqwest::Client::new();
    let resp = client
        .delete(format!("{}{}", STRIPE_API, path))
        .basic_auth(secret_key, Option::<&str>::None)
        .send()
        .await?;

    let data: Value = resp.json().await?;
    Ok(data)
}

pub async fn create_customer(secret_key: &str, email: &str) -> Result<String> {
    let data = stripe_post(secret_key, "/customers", &[("email", email)]).await?;
    let id = data["id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No customer ID in Stripe response"))?
        .to_string();
    Ok(id)
}

pub async fn create_subscription(secret_key: &str, email: &str, price_id: &str) -> Result<Value> {
    // Create or retrieve customer
    let customer_id = create_customer(secret_key, email).await?;

    let data = stripe_post(
        secret_key,
        "/subscriptions",
        &[
            ("customer", customer_id.as_str()),
            ("items[0][price]", price_id),
        ],
    )
    .await?;

    Ok(data)
}

pub async fn cancel_subscription(secret_key: &str, subscription_id: &str) -> Result<Value> {
    stripe_delete(secret_key, &format!("/subscriptions/{}", subscription_id)).await
}

pub async fn create_payment_intent(
    secret_key: &str,
    amount_cents: u64,
    currency: &str,
    customer_id: &str,
) -> Result<Value> {
    stripe_post(
        secret_key,
        "/payment_intents",
        &[
            ("amount", &amount_cents.to_string()),
            ("currency", currency),
            ("customer", customer_id),
        ],
    )
    .await
}

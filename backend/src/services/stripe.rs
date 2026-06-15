use anyhow::Result;
use reqwest::Client;
use serde_json::{json, Value};

const STRIPE_API: &str = "https://api.stripe.com/v1";

async fn stripe_post(
    client: &Client,
    secret_key: &str,
    path: &str,
    params: &[(&str, &str)],
) -> Result<Value> {
    let resp = client
        .post(format!("{}{}", STRIPE_API, path))
        .basic_auth(secret_key, Option::<&str>::None)
        .form(params)
        .send()
        .await?;

    parse_stripe_response(resp).await
}

async fn parse_stripe_response(resp: reqwest::Response) -> Result<Value> {
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let data = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({ "message": text }));

    if !status.is_success() {
        let message = data["error"]["message"]
            .as_str()
            .or_else(|| data["message"].as_str())
            .unwrap_or("Stripe request failed");
        anyhow::bail!("Stripe error: {} (HTTP {})", message, status.as_u16());
    }

    if let Some(err) = data.get("error") {
        anyhow::bail!(
            "Stripe error: {}",
            err["message"].as_str().unwrap_or("unknown")
        );
    }
    Ok(data)
}

async fn stripe_delete(client: &Client, secret_key: &str, path: &str) -> Result<Value> {
    let resp = client
        .delete(format!("{}{}", STRIPE_API, path))
        .basic_auth(secret_key, Option::<&str>::None)
        .send()
        .await?;

    parse_stripe_response(resp).await
}

pub async fn cancel_subscription(
    client: &Client,
    secret_key: &str,
    subscription_id: &str,
) -> Result<Value> {
    stripe_delete(
        client,
        secret_key,
        &format!("/subscriptions/{}", subscription_id),
    )
    .await
}

pub struct CheckoutSessionRequest<'a> {
    pub secret_key: &'a str,
    pub email: &'a str,
    pub price_id: &'a str,
    pub success_url: &'a str,
    pub cancel_url: &'a str,
    pub user_id: &'a str,
    pub business_id: &'a str,
    pub tier: &'a str,
    pub billing_cycle: &'a str,
}

pub async fn create_checkout_session(
    client: &Client,
    request: CheckoutSessionRequest<'_>,
) -> Result<Value> {
    stripe_post(
        client,
        request.secret_key,
        "/checkout/sessions",
        &[
            ("mode", "subscription"),
            ("customer_email", request.email),
            ("line_items[0][price]", request.price_id),
            ("line_items[0][quantity]", "1"),
            ("success_url", request.success_url),
            ("cancel_url", request.cancel_url),
            ("metadata[user_id]", request.user_id),
            ("metadata[business_id]", request.business_id),
            ("metadata[tier]", request.tier),
            ("metadata[billing_cycle]", request.billing_cycle),
            ("subscription_data[metadata][user_id]", request.user_id),
            (
                "subscription_data[metadata][business_id]",
                request.business_id,
            ),
            ("subscription_data[metadata][tier]", request.tier),
            (
                "subscription_data[metadata][billing_cycle]",
                request.billing_cycle,
            ),
        ],
    )
    .await
}

use axum::body::Body as AxumBody;
use bytes::Bytes;
use http_body_util::BodyExt;
use tokio::sync::OnceCell;
use tower::ServiceExt;
use vercel_runtime::{run, Body, Error, Request, Response};

static ROUTER: OnceCell<axum::Router> = OnceCell::const_new();

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}

pub async fn handler(req: Request) -> Result<Response<Body>, Error> {
    let router = ROUTER
        .get_or_try_init(|| vantage_backend::build_app())
        .await?;

    let (parts, body) = req.into_parts();
    let body_bytes: Bytes = match body {
        Body::Empty => Bytes::new(),
        Body::Text(s) => Bytes::from(s.into_bytes()),
        Body::Binary(b) => Bytes::from(b),
    };
    let axum_req = http::Request::from_parts(parts, AxumBody::from(body_bytes));

    let axum_resp = router.clone().oneshot(axum_req).await.unwrap();

    let (parts, body) = axum_resp.into_parts();
    let body_bytes = body
        .collect()
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?
        .to_bytes();

    Ok(http::Response::from_parts(parts, Body::Binary(body_bytes.to_vec())))
}

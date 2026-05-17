use axum::body::Body as AxumBody;
use http_body_util::BodyExt;
use tokio::sync::OnceCell;
use tower::ServiceExt;
use vercel_runtime::{run, service_fn, Error, Request, Response, ResponseBody};

static ROUTER: OnceCell<axum::Router> = OnceCell::const_new();

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(handler)).await
}

async fn handler(req: Request) -> Result<Response<ResponseBody>, Error> {
    let router = ROUTER.get_or_try_init(vantage_backend::build_app).await?;

    let (parts, body) = req.into_parts();
    let body_bytes = body
        .collect()
        .await
        .map_err(|e| Box::new(e) as Error)?
        .to_bytes();
    let axum_req = http::Request::from_parts(parts, AxumBody::from(body_bytes));

    let axum_resp = router
        .clone()
        .oneshot(axum_req)
        .await
        .expect("axum router should be infallible");

    let (parts, body) = axum_resp.into_parts();
    let body_bytes = axum::body::to_bytes(body, usize::MAX)
        .await
        .map_err(|e| Box::new(e) as Error)?;

    Ok(Response::from_parts(parts, ResponseBody::from(body_bytes)))
}

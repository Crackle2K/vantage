use axum::body::Body as AxumBody;
use http::StatusCode;
use http_body_util::{BodyExt, Limited};
use tokio::sync::OnceCell;
use tower::ServiceExt;
use vercel_runtime::{run, service_fn, Error, Request, Response, ResponseBody};

static ROUTER: OnceCell<axum::Router> = OnceCell::const_new();
const MAX_REQUEST_BODY_BYTES: usize = 2 * 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES: usize = 20 * 1024 * 1024;

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(handler)).await
}

async fn handler(req: Request) -> Result<Response<ResponseBody>, Error> {
    let router = ROUTER.get_or_try_init(vantage_backend::build_app).await?;

    let (parts, body) = req.into_parts();
    let body_bytes = match Limited::new(body, MAX_REQUEST_BODY_BYTES).collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => {
            return Response::builder()
                .status(StatusCode::PAYLOAD_TOO_LARGE)
                .body(ResponseBody::from("Request body too large"))
                .map_err(|e| Box::new(e) as Error);
        }
    };
    let axum_req = http::Request::from_parts(parts, AxumBody::from(body_bytes));

    let axum_resp = router
        .clone()
        .oneshot(axum_req)
        .await
        .expect("axum router should be infallible");

    let (parts, body) = axum_resp.into_parts();
    let body_bytes = axum::body::to_bytes(body, MAX_RESPONSE_BODY_BYTES)
        .await
        .map_err(|e| Box::new(e) as Error)?;

    Ok(Response::from_parts(parts, ResponseBody::from(body_bytes)))
}

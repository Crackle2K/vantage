"""Vercel API proxy for the Rust backend.

Vercel hosts the frontend as a static SPA in this project. The Rust API must be
deployed as a separate service and exposed through RUST_API_URL or API_URL. This
proxy preserves the same-origin /api contract for the frontend without exposing
backend credentials or falling through to the SPA.
"""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import Iterable
from urllib.parse import urljoin

import httpx

_HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}
_FORWARDED_HEADER_ALLOWLIST = {
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "cookie",
    "user-agent",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
}
_MAX_BODY_BYTES = int(os.getenv("API_PROXY_MAX_BODY_BYTES", "1048576"))
_TIMEOUT_SECONDS = float(os.getenv("API_PROXY_TIMEOUT_SECONDS", "15"))


def _backend_base_url() -> str | None:
    raw = (os.getenv("RUST_API_URL") or os.getenv("API_URL") or "").strip()
    if not raw or raw.startswith("http://localhost") or raw.startswith("http://127.0.0.1"):
        return None
    return raw.rstrip("/")


def _iter_headers(headers: object) -> Iterable[tuple[str, str]]:
    if hasattr(headers, "items"):
        for key, value in headers.items():
            yield str(key), str(value)
        return
    for item in headers or []:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            key = item[0].decode("latin-1") if isinstance(item[0], bytes) else str(item[0])
            value = item[1].decode("latin-1") if isinstance(item[1], bytes) else str(item[1])
            yield key, value


def _forward_headers(request_headers: object) -> dict[str, str]:
    forwarded: dict[str, str] = {}
    for key, value in _iter_headers(request_headers):
        lowered = key.lower()
        if lowered in _FORWARDED_HEADER_ALLOWLIST and lowered not in _HOP_BY_HOP_HEADERS:
            forwarded[lowered] = value
    return forwarded


def _response_headers(response: httpx.Response) -> list[tuple[str, str]]:
    headers: list[tuple[str, str]] = []
    for key, value in response.headers.items():
        lowered = key.lower()
        if lowered not in _HOP_BY_HOP_HEADERS:
            headers.append((key, value))
    return headers


async def app(scope, receive, send):  # noqa: ANN001
    if scope["type"] != "http":
        return

    backend_base = _backend_base_url()
    if backend_base is None:
        await _send_json(
            send,
            HTTPStatus.SERVICE_UNAVAILABLE,
            b'{"detail":"Rust API backend is not configured"}',
        )
        return

    body = bytearray()
    more_body = True
    while more_body:
        message = await receive()
        chunk = message.get("body", b"")
        body.extend(chunk)
        if len(body) > _MAX_BODY_BYTES:
            await _send_json(send, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, b'{"detail":"Request body too large"}')
            return
        more_body = message.get("more_body", False)

    path = scope.get("path", "/")
    query = scope.get("query_string", b"").decode("ascii", errors="ignore")
    upstream_path = path if path.startswith("/api/") else f"/api{path}"
    upstream_url = urljoin(f"{backend_base}/", upstream_path.lstrip("/"))
    if query:
        upstream_url = f"{upstream_url}?{query}"

    headers = _forward_headers(scope.get("headers", []))
    async with httpx.AsyncClient(follow_redirects=False, timeout=_TIMEOUT_SECONDS) as client:
        response = await client.request(
            scope["method"],
            upstream_url,
            content=bytes(body),
            headers=headers,
        )

    await send(
        {
            "type": "http.response.start",
            "status": response.status_code,
            "headers": [
                (key.encode("latin-1"), value.encode("latin-1"))
                for key, value in _response_headers(response)
            ],
        }
    )
    await send({"type": "http.response.body", "body": response.content})


async def _send_json(send, status: HTTPStatus, body: bytes) -> None:  # noqa: ANN001
    await send(
        {
            "type": "http.response.start",
            "status": int(status),
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": body})

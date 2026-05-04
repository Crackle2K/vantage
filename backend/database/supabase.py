"""Supabase client singleton and async execution helpers."""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Callable, TypeVar

import httpx
from supabase import Client, create_client

from backend.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

T = TypeVar("T")

SUPABASE_REQUEST_TIMEOUT_SECONDS = 10.0
SUPABASE_RETRY_ATTEMPTS = 3
SUPABASE_RETRY_BASE_DELAY_SECONDS = 0.35


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Create and cache the Supabase client.

    Returns:
        Client: An authenticated Supabase client using the service-role key.

    Raises:
        RuntimeError: If ``SUPABASE_URL`` or ``SUPABASE_SERVICE_ROLE_KEY``
            is not configured.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _is_retryable_supabase_error(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, httpx.TimeoutException, httpx.NetworkError, httpx.TransportError)):
        return True
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    return isinstance(status_code, int) and status_code >= 500


async def run_supabase(operation: Callable[[], T], *, timeout_seconds: float = SUPABASE_REQUEST_TIMEOUT_SECONDS) -> T:
    """Run a synchronous Supabase operation off the event loop with retry/timeout."""
    loop = asyncio.get_running_loop()
    last_error: Exception | None = None

    for attempt in range(SUPABASE_RETRY_ATTEMPTS):
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, operation),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            last_error = TimeoutError(f"Supabase request timed out after {timeout_seconds:.1f}s")
        except Exception as exc:  # pragma: no cover - depends on network/runtime failures
            last_error = exc

        if last_error is not None and (attempt + 1) < SUPABASE_RETRY_ATTEMPTS and _is_retryable_supabase_error(last_error):
            await asyncio.sleep(SUPABASE_RETRY_BASE_DELAY_SECONDS * (2 ** attempt))
            continue
        break

    assert last_error is not None
    raise last_error

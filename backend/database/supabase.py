"""Supabase client singleton.

Provides a cached Supabase client instance used across the application for
authentication and data access. The client is created once and reused via
``lru_cache``.
"""
from functools import lru_cache

from supabase import Client, create_client

from backend.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


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

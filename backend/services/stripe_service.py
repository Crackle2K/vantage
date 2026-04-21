"""Stripe payment integration for business subscriptions.

Wraps the Stripe Python SDK to provide checkout session creation,
configuration checks, and webhook signature verification. All Stripe
calls go through this module to centralize API key management.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import stripe

from backend.config import STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET


@lru_cache(maxsize=1)
def configure_stripe() -> None:
    if STRIPE_SECRET_KEY:
        stripe.api_key = STRIPE_SECRET_KEY


def stripe_is_configured() -> bool:
    """Check whether Stripe billing is configured.

    Returns:
        bool: True if ``STRIPE_SECRET_KEY`` is set.
    """
    return bool(STRIPE_SECRET_KEY)


def get_stripe_publishable_key() -> str:
    return STRIPE_PUBLISHABLE_KEY


def get_stripe_webhook_secret() -> str:
    return STRIPE_WEBHOOK_SECRET


def create_checkout_session(**kwargs: Any) -> stripe.checkout.Session:
    """Create a Stripe Checkout Session for subscription payment.

    Args:
        **kwargs: Arguments forwarded to ``stripe.checkout.Session.create()``.

    Returns:
        stripe.checkout.Session: The created checkout session.

    Raises:
        RuntimeError: If ``STRIPE_SECRET_KEY`` is not configured.
    """
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured. Set STRIPE_SECRET_KEY.")
    configure_stripe()
    return stripe.checkout.Session.create(**kwargs)


def verify_webhook_signature(payload: bytes, signature: str, secret: str | None = None) -> dict[str, Any]:
    """Verify and construct a Stripe webhook event from raw payload.

    Args:
        payload (bytes): Raw request body.
        signature (str): Stripe-Signature header value.
        secret (str | None): Webhook signing secret; defaults to ``STRIPE_WEBHOOK_SECRET``.

    Returns:
        dict[str, Any]: The verified Stripe event object.

    Raises:
        RuntimeError: If the webhook secret is not configured.
    """
    webhook_secret = secret or STRIPE_WEBHOOK_SECRET
    if not webhook_secret:
        raise RuntimeError("Stripe webhook secret is not configured.")
    return stripe.Webhook.construct_event(payload, signature, webhook_secret)

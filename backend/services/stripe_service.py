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
    return bool(STRIPE_SECRET_KEY)


def get_stripe_publishable_key() -> str:
    return STRIPE_PUBLISHABLE_KEY


def get_stripe_webhook_secret() -> str:
    return STRIPE_WEBHOOK_SECRET


def create_checkout_session(**kwargs: Any) -> stripe.checkout.Session:
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured. Set STRIPE_SECRET_KEY.")
    configure_stripe()
    return stripe.checkout.Session.create(**kwargs)


def verify_webhook_signature(payload: bytes, signature: str, secret: str | None = None) -> dict[str, Any]:
    webhook_secret = secret or STRIPE_WEBHOOK_SECRET
    if not webhook_secret:
        raise RuntimeError("Stripe webhook secret is not configured.")
    return stripe.Webhook.construct_event(payload, signature, webhook_secret)

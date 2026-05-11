"""Security utilities for input validation and sanitization.

Provides plain-text sanitization, public URL validation, password strength
validation, and a basic profanity filter for user-generated content.
"""
import ipaddress
import re
import socket
from typing import Iterable, Optional, Tuple
from urllib.parse import urlsplit, urlunsplit

import bleach


_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain"}


def sanitize_text(content: object, max_length: int = 500) -> str:
    """Return bounded, plain text safe to persist or echo in JSON.

    HTML is stripped rather than escaped because Vantage stores user text as
    plain text. Control characters are removed before whitespace normalization
    to avoid hidden payloads and layout-breaking input.
    """
    if not content:
        return ""

    cleaned = bleach.clean(str(content), tags=[], attributes={}, protocols=[], strip=True)
    cleaned = _CONTROL_CHARS_RE.sub("", cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned[:max_length].strip()


def normalize_text_list(
    values: Optional[Iterable[object]],
    limit: int,
    max_item_length: int = 32,
) -> list[str]:
    """Sanitize, deduplicate, and cap a user-controlled text list."""
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        cleaned = sanitize_text(value, max_length=max_item_length)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned)
        if len(normalized) >= limit:
            break
    return normalized


def _hostname_is_public(hostname: str) -> bool:
    host = hostname.strip().rstrip(".").lower()
    if not host or host in _BLOCKED_HOSTNAMES:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return ip.is_global


def hostname_resolves_publicly(hostname: str) -> bool:
    """Return whether every resolved address is globally routable.

    This is used before server-side URL fetches to reduce SSRF risk. DNS errors
    are treated as unsafe because the caller cannot prove the target is public.
    """
    host = hostname.strip().rstrip(".").lower()
    if not _hostname_is_public(host):
        return False
    try:
        results = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    addresses = {result[4][0] for result in results if result and result[4]}
    if not addresses:
        return False
    return all(_hostname_is_public(address) for address in addresses)


def normalize_url(
    value: object,
    *,
    max_length: int = 500,
    require_https: bool = False,
    require_public_host: bool = True,
) -> Optional[str]:
    """Normalize and validate a public HTTP(S) URL.

    Returns ``None`` for empty input. Raises ``ValueError`` for malformed or
    unsafe input so routes can return a normal FastAPI validation error.
    """
    raw = str(value or "").strip()
    if len(raw) > max_length:
        raise ValueError("URL is too long")
    candidate = sanitize_text(raw, max_length=max_length)
    if not candidate:
        return None

    parsed = urlsplit(candidate)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        raise ValueError("URL must use http or https")
    if require_https and scheme != "https":
        raise ValueError("URL must use https")
    if not parsed.netloc or not parsed.hostname:
        raise ValueError("URL must include a host")
    if parsed.username or parsed.password:
        raise ValueError("URL must not include credentials")
    if require_public_host and not _hostname_is_public(parsed.hostname):
        raise ValueError("URL host is not allowed")

    netloc = parsed.hostname.lower()
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunsplit((scheme, netloc, parsed.path or "", parsed.query or "", ""))


def normalize_optional_url(value: object, **kwargs) -> Optional[str]:
    """Normalize an optional URL and return ``None`` when it is blank."""
    if value is None or str(value).strip() == "":
        return None
    return normalize_url(value, **kwargs)


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validate password meets complexity requirements.

    Requires at least 8 characters (max 128) and at least 3 of:
    uppercase, lowercase, digits, special characters.

    Args:
        password (str): The password to validate.

    Returns:
        Tuple[bool, str]: (is_valid, error_message). error_message is
            empty when the password is valid.
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if len(password) > 128:
        return False, "Password must be less than 128 characters"

    checks = {
        "uppercase": re.search(r"[A-Z]", password) is not None,
        "lowercase": re.search(r"[a-z]", password) is not None,
        "digit": re.search(r"\d", password) is not None,
        "special": re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]", password) is not None,
    }

    passed = sum(checks.values())

    if passed < 3:
        missing = [name for name, passed_check in checks.items() if not passed_check]
        return False, f"Password must include at least 3 of: uppercase, lowercase, digits, special characters. Missing: {', '.join(missing)}"

    return True, ""


def contains_profanity(text: str) -> bool:
    """
    Basic profanity filter. Returns True if profanity is detected.
    This is a basic implementation - consider using a dedicated library
    like better-profanity for production use.
    """
    # Common profanity patterns (basic list)
    patterns = [
        r'\bfuck',
        r'\bshit',
        r'\basshole',
        r'\bbitch',
        r'\bcunt',
        r'\bdamn',
    ]

    text_lower = text.lower()
    for pattern in patterns:
        if re.search(pattern, text_lower):
            return True
    return False

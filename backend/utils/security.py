"""Security utilities for input validation and sanitization."""
import re
import bleach
from typing import Tuple


def sanitize_text(content: str, max_length: int = 500) -> str:
    """
    Sanitize user-generated text content.
    Removes HTML tags, scripts, and potentially dangerous content.
    """
    if not content:
        return ""

    # Strip all HTML tags - we only want plain text
    cleaned = bleach.clean(content, tags=[], strip=True)

    # Normalize whitespace
    cleaned = " ".join(cleaned.split())

    # Truncate to max length
    return cleaned[:max_length].strip()


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Validate password meets complexity requirements.
    Returns (is_valid, error_message).
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
"""Audit logging utilities for security-sensitive operations."""
import os
from datetime import datetime
from typing import Optional, Any
import logging

# Configure audit logger
audit_logger = logging.getLogger("vantage.audit")
audit_logger.setLevel(logging.INFO)

# Ensure we don't log to console in production if not configured
if not audit_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        '%(asctime)s - AUDIT - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S UTC'
    ))
    audit_logger.addHandler(handler)


def log_security_event(
    event_type: str,
    user_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    success: bool = True,
) -> None:
    """
    Log a security-relevant event for audit purposes.

    Args:
        event_type: Type of event (e.g., 'login', 'password_change', 'data_export')
        user_id: ID of the user performing the action
        ip_address: IP address of the request
        details: Additional event details (will be sanitized)
        success: Whether the operation succeeded
    """
    # Sanitize details to remove sensitive data
    safe_details = {}
    if details:
        sensitive_keys = {'password', 'token', 'secret', 'credential', 'api_key'}
        for key, value in details.items():
            if any(s in key.lower() for s in sensitive_keys):
                safe_details[key] = '[REDACTED]'
            else:
                safe_details[key] = value

    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event_type": event_type,
        "user_id": user_id or "anonymous",
        "ip_address": ip_address or "unknown",
        "success": success,
        "details": safe_details,
    }

    audit_logger.info(f"{event_type} | user={user_id} | ip={ip_address} | success={success} | {safe_details}")


def log_data_export(user_id: str, ip_address: str, data_types: list[str]) -> None:
    """Log GDPR data export requests."""
    log_security_event(
        event_type="data_export",
        user_id=user_id,
        ip_address=ip_address,
        details={"data_types": data_types},
    )


def log_account_deletion(user_id: str, ip_address: str) -> None:
    """Log account deletion requests."""
    log_security_event(
        event_type="account_deletion",
        user_id=user_id,
        ip_address=ip_address,
    )


def log_password_change(user_id: str, ip_address: str, success: bool) -> None:
    """Log password change attempts."""
    log_security_event(
        event_type="password_change",
        user_id=user_id,
        ip_address=ip_address,
        success=success,
    )


def log_login(user_id: str, ip_address: str, success: bool, method: str = "password") -> None:
    """Log login attempts."""
    log_security_event(
        event_type="login",
        user_id=user_id,
        ip_address=ip_address,
        success=success,
        details={"method": method},
    )


def log_failed_auth(ip_address: str, reason: str) -> None:
    """Log failed authentication attempts."""
    log_security_event(
        event_type="failed_auth",
        ip_address=ip_address,
        success=False,
        details={"reason": reason},
    )
"""Compatibility exports for the Supabase-backed document store.

Runtime code imports from ``backend.database.document_store``. This module
keeps older ``backend.database.mongodb`` imports working without maintaining a
second, divergent implementation.
"""
from backend.database.document_store import *  # noqa: F401,F403

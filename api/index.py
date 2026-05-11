"""Vercel serverless entry point — adds backend/ to sys.path and re-exports app."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from main import app  # noqa: F401  (Vercel imports `app` from this module)

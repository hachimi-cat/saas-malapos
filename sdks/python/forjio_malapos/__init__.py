"""Malapos Python SDK — typed client for the malapos.com point-of-sale REST API."""
from .client import MalaposClient, Page
from .errors import MalaposError
from .webhooks import EVENT_TYPES, SIGNATURE_HEADER, verify_webhook

__all__ = ["MalaposClient", "MalaposError", "Page", "verify_webhook", "EVENT_TYPES", "SIGNATURE_HEADER"]
__version__ = "0.3.0"

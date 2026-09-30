"""Malapos Python SDK — typed client for the malapos.com point-of-sale REST API."""
from .client import MalaposClient, Page
from .errors import MalaposError

__all__ = ["MalaposClient", "MalaposError", "Page"]
__version__ = "0.1.0"

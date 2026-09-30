"""Malapos client — mirrors ``@forjio/malapos`` (JS).

Every route of the API is a method on ``client.api`` (generated from the API spec:
api_generated.py), e.g. ``client.api.products_list(q="kopi")``.

Auth = ``Authorization: Bearer <token>`` — an ``sk_live_...`` API key from the
dashboard (**API keys**; it acts in the workspace it was created in) or a
Huudis-issued access token. Pass ``token=`` or set ``MALAPOS_TOKEN``.

Every response rides the Forjio envelope ``{data, error, meta}``; the client returns
``data`` and raises :class:`MalaposError` (with the envelope's ``error.code``) on
failure. A list route that pages returns a :class:`Page` — a ``list`` with
``cursor`` and ``has_more`` from ``meta``; pass the cursor back as the route's
``cursor`` argument for the next page.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import httpx

from .api_generated import GeneratedApi
from .errors import MalaposError


class Page(list):
    """A list page: the route's items, with the envelope's paging meta."""

    cursor: Optional[str]
    has_more: bool

    def __init__(self, items: Any, cursor: Optional[str], has_more: bool) -> None:
        super().__init__(items)
        self.cursor = cursor
        self.has_more = has_more


def _query_value(v: Any) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return json.dumps(v, separators=(",", ":"))


class MalaposClient:
    """Malapos typed client.

    Example::

        client = MalaposClient(token=os.environ["MALAPOS_TOKEN"])
        products = client.api.products_list(q="kopi")
        client.api.sales_void(sale_id, reason="wrong item")
    """

    def __init__(
        self,
        *,
        token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        http: Optional[httpx.Client] = None,
    ) -> None:
        self._token = token if token is not None else os.environ.get("MALAPOS_TOKEN")
        self._base_url = (base_url or os.environ.get("MALAPOS_BASE_URL") or "https://malapos.com").rstrip("/")
        self._timeout = timeout
        self._http = http
        # Every feature route, one method each (generated from the API spec).
        self.api = GeneratedApi(self)

    def request_envelope(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, Any]] = None,
        body: Any = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Send one request and return the whole envelope (``data`` + ``meta``)."""
        req_headers = {"Accept": "application/json"}
        if headers:
            req_headers.update(headers)
        if self._token:
            req_headers["Authorization"] = f"Bearer {self._token}"
        params = {k: _query_value(v) for k, v in (query or {}).items() if v is not None} or None
        kwargs: Dict[str, Any] = {"params": params, "headers": req_headers, "timeout": self._timeout}
        if body is not None:
            kwargs["json"] = body
        try:
            if self._http is not None:
                resp = self._http.request(method.upper(), self._base_url + path, **kwargs)
            else:
                resp = httpx.request(method.upper(), self._base_url + path, **kwargs)
        except httpx.TimeoutException as e:
            raise MalaposError(0, "TIMEOUT", f"request timed out: {e}") from e
        except httpx.HTTPError as e:
            raise MalaposError(0, "NETWORK_ERROR", str(e)) from e

        if not resp.content:
            if resp.status_code >= 400:
                raise MalaposError(resp.status_code, "HTTP_ERROR", f"HTTP {resp.status_code}")
            return {"data": None, "error": None, "meta": {}}
        try:
            envelope = resp.json()
        except ValueError as e:
            raise MalaposError(
                resp.status_code, "INVALID_RESPONSE", f"non-JSON response (HTTP {resp.status_code})"
            ) from e
        if not isinstance(envelope, dict):
            envelope = {"data": envelope, "error": None, "meta": {}}
        error = envelope.get("error")
        meta = envelope.get("meta") if isinstance(envelope.get("meta"), dict) else {}
        if resp.status_code >= 400 or error:
            err = error if isinstance(error, dict) else {}
            message = err.get("message", f"HTTP {resp.status_code}")
            if resp.status_code == 401 and not self._token:
                message += " (no token configured: pass token= or set MALAPOS_TOKEN)"
            raise MalaposError(
                resp.status_code,
                err.get("code", "HTTP_ERROR"),
                message,
                meta.get("requestId"),
                err.get("param"),
            )
        return envelope

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, Any]] = None,
        body: Any = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        """Send one request and return its ``data`` (a paging list comes back as a :class:`Page`)."""
        envelope = self.request_envelope(method, path, query=query, body=body, headers=headers)
        data = envelope.get("data")
        meta = envelope.get("meta") or {}
        if isinstance(data, list) and ("cursor" in meta or "hasMore" in meta):
            return Page(data, meta.get("cursor"), bool(meta.get("hasMore")))
        return data

    def _apigen_request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """The call behind ``client.api.*`` (api_generated.py)."""
        return self.request(method, path, query=query, body=body)

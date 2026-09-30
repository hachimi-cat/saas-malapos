"""Typed error class for the Malapos SDK."""

from __future__ import annotations

from typing import Optional


class MalaposError(Exception):
    """Raised when a Malapos API call fails.

    Attributes
    ----------
    status:
        HTTP status code (0 for transport-level errors like timeouts).
    code:
        Machine-readable error code from the API envelope (``NOT_FOUND``,
        ``VALIDATION_ERROR``, ``AUTH_REQUIRED``, ...) or one of ``TIMEOUT`` /
        ``NETWORK_ERROR`` / ``INVALID_RESPONSE`` for SDK-side failures.
    message:
        Human-readable description.
    request_id:
        The ``meta.requestId`` echoed by the API, when available.
    param:
        The offending parameter on validation errors, when available.
    """

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        request_id: Optional[str] = None,
        param: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.param = param

    def __repr__(self) -> str:
        return (
            f"MalaposError(status={self.status}, code={self.code!r}, "
            f"message={self.message!r}, request_id={self.request_id!r})"
        )

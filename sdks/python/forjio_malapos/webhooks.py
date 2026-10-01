"""Receiving Malapos webhooks.

Every delivery is a POST with::

    Malapos-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>

(plus ``Malapos-Event-Id``, ``Malapos-Event-Type``, ``Malapos-Delivery-Id`` and
``Malapos-Delivery-Attempt``) and the envelope ``{id, type, occurredAt, accountId, data}``
as its body. Verify the signature over the RAW body, before any JSON parsing, with the
subscription's signing secret (``whsec_…``, shown once when the endpoint was added). A
retried delivery keeps its ``id``: use it to drop duplicates.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional, Union

from .errors import MalaposError

SIGNATURE_HEADER = "Malapos-Signature"

EVENT_TYPES = (
    "malapos.sale.completed.v1",
    "malapos.sale.voided.v1",
    "malapos.sale.refunded.v1",
    "malapos.purchase_order.received.v1",
    "malapos.kds.advanced.v1",
    "malapos.kds.reverted.v1",
    "malapos.kds.item_advanced.v1",
    "malapos.kds.item_reverted.v1",
    "malapos.kds.served.v1",
    "malapos.shipping_credit.topped_up.v1",
    "malapos.billing.subscribed.v1",
    "malapos.billing.canceled.v1",
    "malapos.webhook_subscription.disabled.v1",
)


def verify_webhook(
    raw_body: Union[str, bytes],
    signature: Optional[str],
    secret: str,
    *,
    tolerance_seconds: int = 300,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    """Verify a delivery and return its event (the parsed envelope).

    Raises ``MalaposError`` (code ``INVALID_SIGNATURE``) when the header is missing or
    malformed, the timestamp is more than ``tolerance_seconds`` from now, the signature
    does not match, or the body is not JSON::

        event = verify_webhook(request.get_data(), request.headers.get("Malapos-Signature"),
                               os.environ["MALAPOS_WEBHOOK_SECRET"])
        if event["type"] == "malapos.sale.completed.v1":
            ...
    """

    def fail(message: str) -> MalaposError:
        return MalaposError(400, "INVALID_SIGNATURE", message)

    if not signature:
        raise fail("missing Malapos-Signature header")
    parts: Dict[str, str] = {}
    for segment in signature.split(","):
        key, sep, value = segment.partition("=")
        if sep:
            parts[key.strip()] = value.strip()
    t, v1 = parts.get("t", ""), parts.get("v1", "")
    if not t.isdigit() or not v1:
        raise fail("malformed Malapos-Signature header")
    clock = int(time.time()) if now is None else now
    drift = abs(clock - int(t))
    if drift > tolerance_seconds:
        raise fail(f"signature timestamp is {drift}s from now")
    body = raw_body if isinstance(raw_body, bytes) else raw_body.encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), t.encode("ascii") + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise fail("signature does not match")
    try:
        event = json.loads(body.decode("utf-8"))
    except ValueError:
        raise fail("webhook body is not valid JSON") from None
    if not isinstance(event, dict):
        raise fail("webhook body is not an event object")
    return event

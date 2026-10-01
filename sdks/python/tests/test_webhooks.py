"""verify_webhook against the shared test vector (the backend, the JS and the Go SDK
check the same body, secret and timestamp)."""

import hashlib
import hmac
import time

import pytest

from forjio_malapos import MalaposError, verify_webhook

BODY = (
    '{"id":"evt_01jtestvector000000000000","type":"malapos.sale.completed.v1",'
    '"occurredAt":"2026-01-01T00:00:00.000Z","accountId":"acc_test",'
    '"data":{"transactionId":"txn_1","note":"kopi susu — 日本"}}'
)
SECRET = "whsec_malapos_test_vector_0001"
T = 1767225600
SIGNATURE = "t=1767225600,v1=9cfe116208e8a8c7e414ba39612d7c4bc0b04a2e7762d254f741c8de908cfc5c"


def test_accepts_the_shared_vector():
    event = verify_webhook(BODY, SIGNATURE, SECRET, now=T + 10)
    assert event["id"] == "evt_01jtestvector000000000000"
    assert event["type"] == "malapos.sale.completed.v1"
    assert event["data"] == {"transactionId": "txn_1", "note": "kopi susu — 日本"}
    assert verify_webhook(BODY.encode("utf-8"), SIGNATURE, SECRET, now=T)["accountId"] == "acc_test"


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"secret": "whsec_wrong"}, "does not match"),
        ({"raw_body": BODY.replace("txn_1", "txn_2")}, "does not match"),
        ({"now": T + 301}, "301s from now"),
        ({"signature": None}, "missing"),
        ({"signature": "v1=abc"}, "malformed"),
    ],
)
def test_refuses(kwargs, message):
    args = {"raw_body": BODY, "signature": SIGNATURE, "secret": SECRET, "now": T, **kwargs}
    with pytest.raises(MalaposError) as exc:
        verify_webhook(args.pop("raw_body"), args.pop("signature"), args.pop("secret"), now=args["now"])
    assert exc.value.code == "INVALID_SIGNATURE"
    assert message in exc.value.message


def test_fresh_signature_with_default_clock():
    t = int(time.time())
    v1 = hmac.new(SECRET.encode(), f"{t}.{BODY}".encode(), hashlib.sha256).hexdigest()
    assert verify_webhook(BODY, f"t={t},v1={v1}", SECRET)["type"] == "malapos.sale.completed.v1"

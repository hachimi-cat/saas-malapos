"""client.api: every feature route, generated from the API spec (scripts/apigen.sh).
Each call is ``Authorization: Bearer <sk_live_ key or Huudis token>``, unwraps the
{data, error, meta} envelope and raises MalaposError on failure."""

from __future__ import annotations

import json
from typing import Any, List, Optional
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from forjio_malapos import MalaposClient, MalaposError, Page


def _client(
    seen: List[httpx.Request],
    *,
    status: int = 200,
    envelope: Any = None,
    raw: Optional[bytes] = None,
    token: Optional[str] = "sk_live_test",
) -> MalaposClient:
    body = envelope if envelope is not None else {"data": {"ok": True}, "error": None, "meta": {"requestId": "r"}}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, content=raw if raw is not None else json.dumps(body).encode())

    http = httpx.Client(transport=httpx.MockTransport(handler))
    return MalaposClient(token=token, base_url="https://malapos.test", http=http)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MALAPOS_TOKEN", raising=False)
    monkeypatch.delenv("MALAPOS_BASE_URL", raising=False)


def test_create_sends_the_fields_malapos_validates_with_the_bearer_key() -> None:
    seen: List[httpx.Request] = []
    out = _client(seen).api.products_create(name="Kopi susu", kind="GOODS", variants=[{"name": "Default", "price": 18000}])
    assert out == {"ok": True}
    request = seen[0]
    assert (request.method, request.url.path) == ("POST", "/api/v1/products")
    assert json.loads(request.content) == {"name": "Kopi susu", "kind": "GOODS", "variants": [{"name": "Default", "price": 18000}]}
    assert request.headers["authorization"] == "Bearer sk_live_test"
    assert request.headers["content-type"] == "application/json"


def test_path_parameters_in_the_path_and_query_fields_in_the_query() -> None:
    seen: List[httpx.Request] = []
    client = _client(seen)
    client.api.sales_void("sale 1/2", reason="wrong item")
    client.api.products_list(q="kopi susu", active=True)
    assert seen[0].url.raw_path.decode() == "/api/v1/sales/sale%201%2F2/void"
    assert json.loads(seen[0].content) == {"reason": "wrong item"}
    listed = urlsplit(str(seen[1].url))
    assert listed.path == "/api/v1/products"
    assert parse_qs(listed.query) == {"q": ["kopi susu"], "active": ["true"]}
    assert seen[1].content == b""


def test_a_body_whose_fields_the_spec_does_not_know_goes_whole() -> None:
    seen: List[httpx.Request] = []
    _client(seen).api.delivery_rates(json_body={"destination": {"postalCode": "12345"}, "items": [{"weight": 500}]})
    assert json.loads(seen[0].content) == {"destination": {"postalCode": "12345"}, "items": [{"weight": 500}]}


def test_a_required_field_is_checked_before_sending() -> None:
    seen: List[httpx.Request] = []
    with pytest.raises(ValueError):
        _client(seen).api.categories_reorder()
    assert seen == []


def test_token_and_base_url_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MALAPOS_TOKEN", "sk_live_env")
    monkeypatch.setenv("MALAPOS_BASE_URL", "https://staging.malapos.test/")
    seen: List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=b'{"data":[],"error":null,"meta":{}}')

    client = MalaposClient(http=httpx.Client(transport=httpx.MockTransport(handler)))
    client.api.outlets_list()
    assert str(seen[0].url) == "https://staging.malapos.test/api/v1/outlets"
    assert seen[0].headers["authorization"] == "Bearer sk_live_env"


def test_a_paging_list_comes_back_as_a_page() -> None:
    seen: List[httpx.Request] = []
    envelope = {"data": [{"id": "cus_1"}], "error": None, "meta": {"requestId": "r", "cursor": "c_2", "hasMore": True}}
    page = _client(seen, envelope=envelope).api.payments_customers(limit=1)
    assert isinstance(page, Page)
    assert list(page) == [{"id": "cus_1"}]
    assert (page.cursor, page.has_more) == ("c_2", True)
    assert json.dumps(page) == '[{"id": "cus_1"}]'


def test_errors_carry_the_envelope_code_status_and_request_id() -> None:
    seen: List[httpx.Request] = []
    envelope = {"data": None, "error": {"code": "NOT_FOUND", "message": "Sale not found", "param": "id"}, "meta": {"requestId": "req_9"}}
    with pytest.raises(MalaposError) as err:
        _client(seen, status=404, envelope=envelope).api.sales_get("nope")
    e = err.value
    assert (e.status, e.code, e.message, e.request_id, e.param) == (404, "NOT_FOUND", "Sale not found", "req_9", "id")


def test_a_401_without_a_token_says_how_to_configure_one() -> None:
    seen: List[httpx.Request] = []
    envelope = {"data": None, "error": {"code": "AUTH_REQUIRED", "message": "Missing Authorization header"}, "meta": {}}
    with pytest.raises(MalaposError) as err:
        _client(seen, status=401, envelope=envelope, token=None).api.outlets_list()
    assert "authorization" not in seen[0].headers
    assert "MALAPOS_TOKEN" in err.value.message


def test_empty_204_and_non_json_errors() -> None:
    seen: List[httpx.Request] = []
    assert _client(seen, status=204, raw=b"").request("DELETE", "/api/v1/api-keys/k1") is None
    with pytest.raises(MalaposError) as err:
        _client(seen, status=502, raw=b"<html>bad gateway</html>").request("GET", "/api/v1/outlets")
    assert (err.value.status, err.value.code) == (502, "INVALID_RESPONSE")


def test_a_method_for_every_feature_route() -> None:
    client = MalaposClient(token="t")
    methods = [n for n in dir(client.api) if not n.startswith("_")]
    assert len(methods) > 230

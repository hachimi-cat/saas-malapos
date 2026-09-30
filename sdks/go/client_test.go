package malapos

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// Client.API (api_generated.go) goes through apigenRequest: Bearer token, the
// {data, error, meta} envelope, *Error on failure.

type seenReq struct {
	method, uri, auth, contentType string
	body                           []byte
}

func server(t *testing.T, status int, env any) (*httptest.Server, *[]seenReq) {
	t.Helper()
	var seen []seenReq
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen = append(seen, seenReq{r.Method, r.URL.RequestURI(), r.Header.Get("Authorization"), r.Header.Get("Content-Type"), body})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if env != nil {
			_ = json.NewEncoder(w).Encode(env)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func ok(data any) map[string]any {
	return map[string]any{"data": data, "error": nil, "meta": map[string]any{"requestId": "req_ok"}}
}

func clearEnv(t *testing.T) {
	t.Setenv("MALAPOS_TOKEN", "")
	t.Setenv("MALAPOS_BASE_URL", "")
}

func TestCreateSendsBodyAndBearer(t *testing.T) {
	clearEnv(t)
	srv, seen := server(t, 201, ok(map[string]any{"id": "prd_1"}))
	c := New(Config{Token: "sk_live_test", BaseURL: srv.URL})
	data, err := c.API.ProductsCreate(context.Background(), &ProductsCreateArgs{
		Name: "Kopi susu", Kind: Ptr("GOODS"), Variants: []any{map[string]any{"name": "Default", "price": 18000}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `{"id":"prd_1"}` {
		t.Fatalf("data = %s", data)
	}
	r := (*seen)[0]
	if r.method != "POST" || r.uri != "/api/v1/products" || r.auth != "Bearer sk_live_test" || r.contentType != "application/json" {
		t.Fatalf("request = %+v", r)
	}
	if string(r.body) != `{"kind":"GOODS","name":"Kopi susu","variants":[{"name":"Default","price":18000}]}` {
		t.Fatalf("body = %s", r.body)
	}
}

func TestPathAndQuery(t *testing.T) {
	clearEnv(t)
	srv, seen := server(t, 200, ok(nil))
	c := New(Config{Token: "sk_live_test", BaseURL: srv.URL})
	if _, err := c.API.SalesVoid(context.Background(), "sale 1/2", &SalesVoidArgs{Reason: Ptr("wrong item")}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.API.ProductsList(context.Background(), &ProductsListArgs{Q: "kopi susu", Active: true}); err != nil {
		t.Fatal(err)
	}
	if r := (*seen)[0]; r.uri != "/api/v1/sales/sale%201%2F2/void" || string(r.body) != `{"reason":"wrong item"}` {
		t.Fatalf("request = %+v", r)
	}
	r := (*seen)[1]
	u, _ := url.Parse(r.uri)
	if u.Path != "/api/v1/products" || u.Query().Get("q") != "kopi susu" || u.Query().Get("active") != "true" || len(r.body) != 0 {
		t.Fatalf("request = %+v", r)
	}
}

func TestWholeBodyOnAnUntypedRoute(t *testing.T) {
	clearEnv(t)
	srv, seen := server(t, 200, ok(nil))
	c := New(Config{Token: "sk_live_test", BaseURL: srv.URL})
	_, err := c.API.DeliveryRates(context.Background(), &DeliveryRatesArgs{Body: map[string]any{"destination": map[string]any{"postalCode": "12345"}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := string((*seen)[0].body); got != `{"destination":{"postalCode":"12345"}}` {
		t.Fatalf("body = %s", got)
	}
}

func TestRequiredFieldCheckedBeforeSending(t *testing.T) {
	clearEnv(t)
	srv, seen := server(t, 200, ok(nil))
	c := New(Config{Token: "sk_live_test", BaseURL: srv.URL})
	if _, err := c.API.CategoriesReorder(context.Background(), &CategoriesReorderArgs{}); err == nil {
		t.Fatal("want an error for the missing ids")
	}
	if len(*seen) != 0 {
		t.Fatalf("sent %d requests", len(*seen))
	}
}

func TestEnvironmentAndPagingMeta(t *testing.T) {
	clearEnv(t)
	srv, seen := server(t, 200, map[string]any{
		"data": []any{map[string]any{"id": "cus_1"}}, "error": nil,
		"meta": map[string]any{"requestId": "r", "cursor": "c_2", "hasMore": true},
	})
	t.Setenv("MALAPOS_TOKEN", "sk_live_env")
	t.Setenv("MALAPOS_BASE_URL", srv.URL+"/")
	c := New(Config{})
	env, err := c.DoEnvelope(context.Background(), "GET", "/api/v1/payments/customers", url.Values{"limit": {"1"}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(env.Data) != `[{"id":"cus_1"}]` || env.Meta.Cursor == nil || *env.Meta.Cursor != "c_2" || env.Meta.HasMore == nil || !*env.Meta.HasMore {
		t.Fatalf("envelope = %+v", env)
	}
	if r := (*seen)[0]; r.auth != "Bearer sk_live_env" || r.uri != "/api/v1/payments/customers?limit=1" {
		t.Fatalf("request = %+v", r)
	}
}

func TestErrorEnvelope(t *testing.T) {
	clearEnv(t)
	srv, _ := server(t, 404, map[string]any{
		"data": nil, "error": map[string]any{"code": "NOT_FOUND", "message": "Sale not found", "param": "id"},
		"meta": map[string]any{"requestId": "req_9"},
	})
	c := New(Config{Token: "sk_live_test", BaseURL: srv.URL})
	_, err := c.API.SalesGet(context.Background(), "nope")
	var me *Error
	if !errors.As(err, &me) || me.Status != 404 || me.Code != "NOT_FOUND" || me.RequestID != "req_9" || me.Param != "id" {
		t.Fatalf("err = %#v", err)
	}
}

func TestNoTokenSaysHowToSetOne(t *testing.T) {
	clearEnv(t)
	srv, seen := server(t, 401, map[string]any{"data": nil, "error": map[string]any{"code": "AUTH_REQUIRED", "message": "Missing Authorization header"}, "meta": map[string]any{}})
	c := New(Config{BaseURL: srv.URL})
	_, err := c.API.OutletsList(context.Background())
	var me *Error
	if !errors.As(err, &me) || me.Code != "AUTH_REQUIRED" || !strings.Contains(me.Message, "MALAPOS_TOKEN") {
		t.Fatalf("err = %#v", err)
	}
	if (*seen)[0].auth != "" {
		t.Fatalf("sent authorization %q", (*seen)[0].auth)
	}
}

func TestEmptyAndNonJSON(t *testing.T) {
	clearEnv(t)
	srv, _ := server(t, 204, nil)
	c := New(Config{Token: "t", BaseURL: srv.URL})
	if data, err := c.Do(context.Background(), "DELETE", "/api/v1/api-keys/k1", nil, nil); err != nil || data != nil {
		t.Fatalf("data=%s err=%v", data, err)
	}
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(502)
		_, _ = w.Write([]byte("<html>bad gateway</html>"))
	}))
	t.Cleanup(bad.Close)
	_, err := New(Config{Token: "t", BaseURL: bad.URL}).Do(context.Background(), "GET", "/api/v1/outlets", nil, nil)
	var me *Error
	if !errors.As(err, &me) || me.Status != 502 || me.Code != "INVALID_RESPONSE" {
		t.Fatalf("err = %#v", err)
	}
}

// Package malapos is the Go SDK for the Malapos point-of-sale REST API (malapos.com).
// Sister to @forjio/malapos (JS) and forjio-malapos (Python).
//
// Every route of the API is a method on Client.API, generated from the API spec
// (api_generated.go): c.API.ProductsList(ctx, &malapos.ProductsListArgs{Q: "kopi"}).
//
// Auth = "Authorization: Bearer <token>" — an sk_live_… API key from the dashboard (API
// keys; it acts in the workspace it was created in) or a Huudis-issued access token.
// Pass Config.Token or set MALAPOS_TOKEN; MALAPOS_BASE_URL overrides the origin.
//
// Every response rides the Forjio envelope {data, error, meta}; calls return the data as
// JSON, or an *Error carrying the envelope's error.code. List routes that page put a
// cursor in meta: use Client.DoEnvelope to read it.
package malapos

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// SDKVersion is this SDK's version.
const SDKVersion = "0.1.0"

// Config holds the credentials and endpoint overrides; empty fields fall back to the
// environment.
type Config struct {
	// Token is an sk_live_… API key or a Huudis access token. Default MALAPOS_TOKEN.
	Token string
	// BaseURL is the API origin. Default MALAPOS_BASE_URL, else https://malapos.com.
	BaseURL string
	// HTTP overrides the http.Client. Default: 30s timeout.
	HTTP *http.Client
}

// Client is the Malapos client.
type Client struct {
	token   string
	baseURL string
	httpc   *http.Client

	// API has every feature route, one method each (generated from the API spec:
	// api_generated.go).
	API *GeneratedAPI
}

// New constructs a client.
//
//	c := malapos.New(malapos.Config{Token: os.Getenv("MALAPOS_TOKEN")})
//	outlets, err := c.API.OutletsList(ctx)
func New(cfg Config) *Client {
	token := cfg.Token
	if token == "" {
		token = os.Getenv("MALAPOS_TOKEN")
	}
	base := cfg.BaseURL
	if base == "" {
		base = os.Getenv("MALAPOS_BASE_URL")
	}
	if base == "" {
		base = "https://malapos.com"
	}
	httpc := cfg.HTTP
	if httpc == nil {
		httpc = &http.Client{Timeout: 30 * time.Second}
	}
	c := &Client{token: token, baseURL: strings.TrimRight(base, "/"), httpc: httpc}
	c.API = &GeneratedAPI{c: c}
	return c
}

// Meta is the envelope's meta: the request id, and on list routes that page, the
// cursor for the next page and whether there is one.
type Meta struct {
	RequestID string  `json:"requestId,omitempty"`
	Timestamp string  `json:"timestamp,omitempty"`
	Cursor    *string `json:"cursor,omitempty"`
	HasMore   *bool   `json:"hasMore,omitempty"`
}

// Envelope is a whole response: its data (JSON) and meta.
type Envelope struct {
	Data json.RawMessage
	Meta Meta
}

// apigenRequest is the call behind Client.API (api_generated.go).
func (c *Client) apigenRequest(ctx context.Context, method, path string, query url.Values, body map[string]any) (json.RawMessage, error) {
	var send any
	if body != nil {
		send = body
	}
	return c.Do(ctx, method, path, query, send)
}

// Do sends one request to any API path and returns the envelope's data. body (nil for
// none) is sent as JSON.
func (c *Client) Do(ctx context.Context, method, path string, query url.Values, body any) (json.RawMessage, error) {
	env, err := c.DoEnvelope(ctx, method, path, query, body)
	if err != nil {
		return nil, err
	}
	return env.Data, nil
}

// DoEnvelope sends one request and returns the whole envelope — data and meta (the
// paging cursor of a list route).
func (c *Client) DoEnvelope(ctx context.Context, method, path string, query url.Values, body any) (*Envelope, error) {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	var raw []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, &Error{Code: "SERIALIZE_FAILED", Message: err.Error()}
		}
		raw = b
	}
	var reader io.Reader = http.NoBody
	if raw != nil {
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, strings.ToUpper(method), u, reader)
	if err != nil {
		return nil, &Error{Code: "REQUEST_BUILD_FAILED", Message: err.Error()}
	}
	req.Header.Set("Accept", "application/json")
	if raw != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	res, err := c.httpc.Do(req)
	if err != nil {
		return nil, &Error{Code: "NETWORK_ERROR", Message: err.Error()}
	}
	defer res.Body.Close()
	text, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, &Error{Status: res.StatusCode, Code: "NETWORK_ERROR", Message: err.Error()}
	}
	if len(bytes.TrimSpace(text)) == 0 {
		if res.StatusCode >= 400 {
			return nil, &Error{Status: res.StatusCode, Code: "HTTP_ERROR", Message: res.Status}
		}
		return &Envelope{}, nil
	}
	var env struct {
		Data  json.RawMessage `json:"data"`
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Param   string `json:"param"`
		} `json:"error"`
		Meta Meta `json:"meta"`
	}
	if err := json.Unmarshal(text, &env); err != nil {
		return nil, &Error{Status: res.StatusCode, Code: "INVALID_RESPONSE", Message: "non-JSON response (" + res.Status + ")"}
	}
	if env.Error != nil || res.StatusCode >= 400 {
		e := &Error{Status: res.StatusCode, Code: "HTTP_ERROR", Message: res.Status, RequestID: env.Meta.RequestID}
		if env.Error != nil {
			e.Code, e.Message, e.Param = env.Error.Code, env.Error.Message, env.Error.Param
		}
		if res.StatusCode == http.StatusUnauthorized && c.token == "" {
			e.Message += " (no token configured: set Config.Token or MALAPOS_TOKEN)"
		}
		return nil, e
	}
	return &Envelope{Data: env.Data, Meta: env.Meta}, nil
}

package malapos

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// SignatureHeader is the header every webhook delivery is signed in:
//
//	Malapos-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
//
// Deliveries also carry Malapos-Event-Id, Malapos-Event-Type, Malapos-Delivery-Id and
// Malapos-Delivery-Attempt. A retried delivery keeps its event id: use it to drop
// duplicates.
const SignatureHeader = "Malapos-Signature"

// EventTypes is the event catalogue (GET /api/v1/webhook-subscriptions/event-types).
var EventTypes = []string{
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
}

// WebhookEvent is a delivery's body: { id, type, occurredAt, accountId, data }.
type WebhookEvent struct {
	// ID is the evt_… id, the same on every delivery attempt.
	ID string `json:"id"`

	// Type is the event type, e.g. malapos.sale.completed.v1.
	Type string `json:"type"`

	// OccurredAt is when the change happened (RFC 3339).
	OccurredAt string `json:"occurredAt"`

	// AccountID is the workspace the event belongs to.
	AccountID string `json:"accountId"`

	// Data is the event's payload, as sent.
	Data json.RawMessage `json:"data"`
}

// VerifyWebhookOptions tunes VerifyWebhook. The zero value checks the timestamp against
// the current time with a 300-second tolerance.
type VerifyWebhookOptions struct {
	// Tolerance is how far the signature's timestamp may be from Now (default 300 s).
	Tolerance time.Duration

	// Now is the clock (default time.Now), for tests.
	Now func() time.Time
}

// VerifyWebhook checks a delivery's Malapos-Signature over the RAW request body with the
// subscription's signing secret (whsec_…) and returns its event. It returns an *Error
// with Code INVALID_SIGNATURE when the header is missing or malformed, the timestamp is
// outside the tolerance, the signature does not match, or the body is not JSON.
//
//	body, _ := io.ReadAll(r.Body)
//	event, err := malapos.VerifyWebhook(body, r.Header.Get(malapos.SignatureHeader), secret, nil)
func VerifyWebhook(rawBody []byte, signature, secret string, opts *VerifyWebhookOptions) (*WebhookEvent, error) {
	fail := func(format string, a ...any) (*WebhookEvent, error) {
		return nil, &Error{Status: 400, Code: "INVALID_SIGNATURE", Message: fmt.Sprintf(format, a...)}
	}
	if opts == nil {
		opts = &VerifyWebhookOptions{}
	}
	tolerance := opts.Tolerance
	if tolerance == 0 {
		tolerance = 300 * time.Second
	}
	now := time.Now
	if opts.Now != nil {
		now = opts.Now
	}
	if signature == "" {
		return fail("missing %s header", SignatureHeader)
	}
	parts := map[string]string{}
	for _, segment := range strings.Split(signature, ",") {
		if k, v, ok := strings.Cut(segment, "="); ok {
			parts[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	t, v1 := parts["t"], parts["v1"]
	ts, err := strconv.ParseInt(t, 10, 64)
	if err != nil || v1 == "" {
		return fail("malformed %s header", SignatureHeader)
	}
	drift := now().Unix() - ts
	if drift < 0 {
		drift = -drift
	}
	if time.Duration(drift)*time.Second > tolerance {
		return fail("signature timestamp is %ds from now", drift)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(t + "."))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(v1)) {
		return fail("signature does not match")
	}
	var event WebhookEvent
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return fail("webhook body is not valid JSON")
	}
	return &event, nil
}

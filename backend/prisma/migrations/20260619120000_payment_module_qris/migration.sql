-- Payment module (Plugipay dynamic QRIS at the sell screen). Two additive
-- columns — no data touched.
--
--   pos_settings.plugipayWebhookSecret — secret of the WebhookEndpoint
--   registered on the merchant's Plugipay workspace at first `payment`
--   enable. The inbound webhook route verifies merchant-order events with
--   it (serront's two-secret verifyAgainstKnownSecrets pattern); distinct
--   from Malapos's OWN billing endpoint secret (env PLUGIPAY_WEBHOOK_SECRET).
--
--   payments.plugipayCheckoutSessionId — the Plugipay checkout-session id
--   minted for a dynamic-QRIS payment. The webhook matches the completed
--   session back to this payment to settle the parked sale.
--
-- See services/plugipay-module-service.ts, routes/payments.ts,
-- routes/webhooks-plugipay.ts, lib/sell.ts.

-- AlterTable
ALTER TABLE "pos_settings" ADD COLUMN "plugipayWebhookSecret" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "plugipayCheckoutSessionId" TEXT;

-- CreateIndex
CREATE INDEX "payments_plugipayCheckoutSessionId_idx" ON "payments"("plugipayCheckoutSessionId");

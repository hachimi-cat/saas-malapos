import { createApp } from './app.js';
import { startOutboxWorker } from './services/outbox-worker.js';
import { registerFeatureFlags } from './lib/feature-flag-registry.js';

const app = createApp();

const port = Number(process.env.PORT ?? 4191);
app.listen(port, () => {
  console.log(`[api] ${process.env.FORJIO_SERVICE ?? 'malapos'} listening on ${port}`);
});

// Outbox worker runs alongside the API process. For production, prefer a
// separate pm2 entry: `node dist/services/outbox-worker.js`. Tests
// (`NODE_ENV=test`) keep the worker off so stray deliveries don't leak.
const outboxDefaultOff = process.env.NODE_ENV === 'test';
const outboxEnabled = process.env.OUTBOX_WORKER_ENABLED
  ? process.env.OUTBOX_WORKER_ENABLED !== 'false'
  : !outboxDefaultOff;
if (outboxEnabled) {
  startOutboxWorker().catch((e) => {
    console.error('[outbox] fatal', e);
    process.exit(1);
  });
}

// Declare this product's feature flags at BOOT, not from the admin page.
// Registering them only when someone opens /admin/feature-flags means the
// row exists in no database until then — and `isEnabled` fails closed on a
// missing row, so a staged flag gates nothing for exactly the accounts it
// was allowlisted for. Idempotent: seeds enabled/rollout/allowlist on
// CREATE only, so a redeploy never re-enables something turned off during
// an incident.
registerFeatureFlags().catch((err) =>
  console.error('[feature-flags] boot registration failed:', err),
);

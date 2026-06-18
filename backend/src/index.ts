import { createApp } from './app.js';
import { startOutboxWorker } from './services/outbox-worker.js';

const app = createApp();

const port = Number(process.env.PORT ?? 4190);
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

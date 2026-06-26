import { Router } from 'express';
import { subscribeFnb } from '../lib/realtime.js';

/*
 * /api/v1/events — Server-Sent Events stream for the realtime F&B boards
 * (behind requireAuth, account-scoped).
 *
 *   GET /stream?outletId=   long-lived SSE connection. Emits
 *     `event: change\ndata: {"topic":"kds|floor|serve"}` whenever a mutation
 *     touches one of this account's boards (see lib/realtime.ts), plus a
 *     `: ping` comment heartbeat every ~25s to keep proxies + the browser
 *     connection alive.
 *
 * The `X-Accel-Buffering: no` response header disables nginx proxy buffering
 * for THIS response only, so each SSE frame flushes immediately through the
 * existing reverse proxy with NO vhost change. EventSource auto-reconnects on
 * drop; the client just refetches on each `change`.
 */

const router = Router();

const HEARTBEAT_MS = 25_000;

router.get('/stream', (req, res) => {
  const accountId = req.auth!.accountId as string;
  const outletId = (req.query.outletId as string | undefined)?.trim() || null;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable nginx proxy_buffering for this response only — without it the
    // proxy holds SSE frames and the board updates arrive late / batched.
    'X-Accel-Buffering': 'no',
  });
  // Flush headers + open the stream right away (some proxies wait for first
  // bytes before forwarding the response).
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const unsubscribe = subscribeFnb((change) => {
    if (change.accountId !== accountId) return;
    // Account-wide events (null outletId) always pass; a concrete event outlet
    // is filtered out only when the subscriber pinned a DIFFERENT outlet.
    if (outletId && change.outletId && change.outletId !== outletId) return;
    res.write(`event: change\ndata: ${JSON.stringify({ topic: change.topic })}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;

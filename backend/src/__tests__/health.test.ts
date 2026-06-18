import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

// Stub prisma so the unit test doesn't need a live DB — integration
// tests (which do need a DB) live beside migrations.
vi.mock('../lib/db.js', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    outboxEvent: { count: vi.fn().mockResolvedValue(0) },
  },
}));

describe('GET /api/v1/health', () => {
  it('returns envelope with service + status + dependency checks', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBeDefined();
    expect(res.body.data.checks).toEqual({ db: 'ok', outbox: 'ok' });
    expect(res.body.meta.requestId).toMatch(/^req_/);
    expect(res.body.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('404s unmatched /api/v1/* with an envelope', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

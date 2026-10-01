import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { MalaposError, verifyWebhook } from '../index.js';

// The shared test vector: the backend (backend/src/__tests__/webhook-delivery.test.ts),
// this SDK, the Python and the Go SDK all check the same body, secret and timestamp.
const BODY =
  '{"id":"evt_01jtestvector000000000000","type":"malapos.sale.completed.v1","occurredAt":"2026-01-01T00:00:00.000Z","accountId":"acc_test","data":{"transactionId":"txn_1","note":"kopi susu — 日本"}}';
const SECRET = 'whsec_malapos_test_vector_0001';
const T = 1767225600;
const SIGNATURE = 't=1767225600,v1=9cfe116208e8a8c7e414ba39612d7c4bc0b04a2e7762d254f741c8de908cfc5c';

describe('verifyWebhook', () => {
  it('accepts the shared test vector and returns the event', () => {
    const event = verifyWebhook({ rawBody: BODY, signature: SIGNATURE, secret: SECRET, now: T + 10 });
    expect(event).toMatchObject({ id: 'evt_01jtestvector000000000000', type: 'malapos.sale.completed.v1', accountId: 'acc_test' });
    expect(event.data).toEqual({ transactionId: 'txn_1', note: 'kopi susu — 日本' });
    // a Buffer body (express.raw) is the same bytes
    expect(verifyWebhook({ rawBody: Buffer.from(BODY), signature: SIGNATURE, secret: SECRET, now: T }).id).toBe(
      'evt_01jtestvector000000000000',
    );
  });

  it('refuses a wrong secret, a changed body, a stale timestamp and a malformed header', () => {
    const refuse = (o: Partial<Parameters<typeof verifyWebhook>[0]>) => {
      try {
        verifyWebhook({ rawBody: BODY, signature: SIGNATURE, secret: SECRET, now: T, ...o });
      } catch (e) {
        expect(e).toBeInstanceOf(MalaposError);
        expect((e as MalaposError).code).toBe('INVALID_SIGNATURE');
        return (e as Error).message;
      }
      throw new Error('accepted');
    };
    expect(refuse({ secret: 'whsec_wrong' })).toMatch(/does not match/);
    expect(refuse({ rawBody: BODY.replace('txn_1', 'txn_2') })).toMatch(/does not match/);
    expect(refuse({ now: T + 301 })).toMatch(/301s from now/);
    expect(refuse({ signature: undefined })).toMatch(/missing/);
    expect(refuse({ signature: 'v1=abc' })).toMatch(/malformed/);
    // a fresh signature over the same body passes with the default clock
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${BODY}`).digest('hex');
    expect(verifyWebhook({ rawBody: BODY, signature: `t=${t},v1=${v1}`, secret: SECRET }).type).toBe('malapos.sale.completed.v1');
  });
});

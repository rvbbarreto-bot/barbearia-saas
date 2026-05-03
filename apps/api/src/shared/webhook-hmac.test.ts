import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySha256WebhookSignature } from './webhook-hmac.js';

describe('verifySha256WebhookSignature', () => {
  const secret = 'segredo-com-pelo-menos-32-chars!!';
  const body = '{"event":"paid"}';

  it('aceita assinatura sha256= válida', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifySha256WebhookSignature(secret, body, sig)).toBe(true);
  });

  it('rejeita assinatura errada', () => {
    expect(verifySha256WebhookSignature(secret, body, 'sha256=deadbeef')).toBe(false);
  });

  it('rejeita corpo alterado', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifySha256WebhookSignature(secret, '{"event":"expired"}', sig)).toBe(false);
  });
});

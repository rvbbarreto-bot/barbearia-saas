import { describe, expect, it } from 'vitest';
import { pixWebhookBodySchema } from './pix-webhook.schemas.js';

describe('pixWebhookBodySchema', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';

  it('payload pago válido', () => {
    const b = pixWebhookBodySchema.parse({
      tenant_id: tenant,
      provider_charge_id: 'chg_1',
      event: 'paid',
      delivery_id: 'del-12345',
    });
    expect(b.event).toBe('paid');
  });

  it('rejeita evento fora do enum', () => {
    expect(() =>
      pixWebhookBodySchema.parse({
        tenant_id: tenant,
        provider_charge_id: 'x',
        event: 'pending',
      }),
    ).toThrow();
  });

  it('rejeita tenant_id inválido', () => {
    expect(() =>
      pixWebhookBodySchema.parse({
        tenant_id: 'não-uuid',
        provider_charge_id: 'x',
        event: 'paid',
      }),
    ).toThrow();
  });

  it('delivery_id curto demais falha', () => {
    expect(() =>
      pixWebhookBodySchema.parse({
        tenant_id: tenant,
        provider_charge_id: 'x',
        event: 'paid',
        delivery_id: 'abc',
      }),
    ).toThrow();
  });
});

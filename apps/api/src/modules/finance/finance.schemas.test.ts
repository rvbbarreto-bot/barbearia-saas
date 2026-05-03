import { describe, expect, it } from 'vitest';
import { discountFinanceSchema, settleFinanceSchema } from './schemas.js';

describe('finance schemas (piloto 020)', () => {
  it('settle: aceita forma de pagamento válida e omite collected (usa saldo na API)', () => {
    const parsed = settleFinanceSchema.parse({
      balance_payment_method: 'pix',
    });
    expect(parsed.balance_payment_method).toBe('pix');
    expect(parsed.balance_collected_cents).toBeUndefined();
  });

  it('settle: liquidação total explícita quando collected igual ao esperado', () => {
    const parsed = settleFinanceSchema.parse({
      balance_payment_method: 'cash',
      balance_collected_cents: 5000,
    });
    expect(parsed.balance_collected_cents).toBe(5000);
  });

  it('settle: rejeita forma de pagamento inválida', () => {
    expect(() =>
      settleFinanceSchema.parse({
        balance_payment_method: 'crypto',
      }),
    ).toThrow();
  });

  it('desconto: válido com motivo suficiente', () => {
    const parsed = discountFinanceSchema.parse({
      discount_cents: 500,
      discount_reason: 'Cortesia cliente antigo',
    });
    expect(parsed.discount_cents).toBe(500);
  });

  it('desconto zero: não exige motivo longo', () => {
    discountFinanceSchema.parse({ discount_cents: 0 });
  });

  it('desconto: exige motivo (mín. 10 caracteres) quando discount > 0', () => {
    expect(() =>
      discountFinanceSchema.parse({
        discount_cents: 100,
        discount_reason: 'curto',
      }),
    ).toThrow();
  });

  it('desconto: sem motivo quando discount > 0 falha', () => {
    expect(() =>
      discountFinanceSchema.parse({
        discount_cents: 100,
      }),
    ).toThrow();
  });
});

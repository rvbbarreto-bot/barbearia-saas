import { describe, expect, it } from 'vitest';
import { inboundBodySchema } from './inbound.schemas.js';

describe('inboundBodySchema (contrato Evolution/WhatsApp)', () => {
  it('payload válido mínimo', () => {
    const b = inboundBodySchema.parse({
      phone: '5511999999999',
      message: 'Oi',
    });
    expect(b.phone).toMatch(/^55/);
  });

  it('rejeita mensagem vazia', () => {
    expect(() =>
      inboundBodySchema.parse({
        phone: '5511999999999',
        message: '',
      }),
    ).toThrow();
  });

  it('aceita tenant_id no body sem validar UUID — campo ignorado pelo serviço', () => {
    const b = inboundBodySchema.parse({
      phone: '5511999999999',
      message: 'Quero horário',
      tenant_id: 'não-uuid-malicioso',
    });
    expect(b.tenant_id).toBe('não-uuid-malicioso');
  });

  it('external_message_id opcional null', () => {
    inboundBodySchema.parse({
      phone: '5511888888888',
      message: 'x',
      external_message_id: null,
    });
  });
});

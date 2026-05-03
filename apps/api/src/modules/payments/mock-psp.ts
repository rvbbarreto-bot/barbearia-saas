import { randomUUID } from 'node:crypto';

export type MockPixChargeInput = {
  amountCents: number;
  ttlMinutes: number;
  /** Referência de negócio (ex.: hold_id) antes do agendamento existir. */
  referenceId: string;
};

export type MockPixChargeResult = {
  provider_charge_id: string;
  copy_paste: string;
  qr_payload: string;
  expiresAtIso: string;
};

/**
 * PSP homologado (mock): gera BR Code fictício + expiração — não expõe chave Pix estática como fluxo principal.
 * Integração real: substituir por cliente HTTP ao PSP (Mercado Pago, Efi, Pagar.me, etc.).
 */
export function createMockPixCharge(input: MockPixChargeInput): MockPixChargeResult {
  const provider_charge_id = `mock_${randomUUID()}`;
  const expires = new Date(Date.now() + input.ttlMinutes * 60 * 1000);
  const payload = [
    '00020101',
    '010212',
    `26${String(input.amountCents).length}${input.amountCents}`,
    `58BR59${provider_charge_id.slice(0, 20)}`,
    '6304',
  ].join('');
  const ref = input.referenceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'ref';
  const copy_paste = `${payload}MOCK${ref.slice(0, 8)}`;
  return {
    provider_charge_id,
    copy_paste,
    qr_payload: copy_paste,
    expiresAtIso: expires.toISOString(),
  };
}

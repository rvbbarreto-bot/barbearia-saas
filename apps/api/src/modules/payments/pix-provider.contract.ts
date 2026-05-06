/**
 * Contrato PSP / PIX — sem integração real até decisão PO e `PIX_REAL_PROVIDER_ENABLED`.
 *
 * O fluxo atual de desenvolvimento usa `createMockPixCharge` (mock-psp) apenas em cenários controlados.
 * Um PSP real deve implementar esta interface com HTTP idempotente, webhooks assinados e mapeamento de status.
 */

/** Estados canónicos internos (alinhados a `pix_payments` quando aplicável). */
export type PixPaymentStatus =
  | 'pending'
  | 'paid'
  | 'expired'
  | 'cancelled'
  | 'failed';

export type CreatePixChargeInput = {
  tenantId: string;
  amountCents: number;
  description?: string;
  /** Referência de negócio (ex.: hold_id, appointment_id). */
  referenceId: string;
  ttlMinutes: number;
};

export type CreatePixChargeResult = {
  providerChargeId: string;
  copyPaste: string;
  qrPayload: string;
  expiresAtIso: string;
};

export type PixWebhookVerification = { ok: true } | { ok: false; reason: string };

/**
 * Interface que um PSP real deve implementar. Não expor segredos fora do processo da API.
 */
export interface IPixProvider {
  readonly providerId: string;

  createCharge(input: CreatePixChargeInput): Promise<CreatePixChargeResult>;

  /** Validar assinatura HMAC / mTLS conforme PSP. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PixWebhookVerification>;

  /** Mapear payload do webhook para status interno + referência. */
  parseWebhookPayload(rawBody: Buffer): Promise<{
    status: PixPaymentStatus;
    providerChargeId: string;
    paidAmountCents?: number;
  }>;
}

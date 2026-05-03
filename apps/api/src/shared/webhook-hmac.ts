import { createHmac, timingSafeEqual } from 'node:crypto';

/** Assinatura no estilo Evolution/Meta: `sha256=` + hex(HMAC-SHA256(body)). */
export function verifySha256WebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(signatureHeader.padEnd(expected.length));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

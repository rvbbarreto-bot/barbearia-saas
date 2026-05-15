/**
 * outbox-worker.ts
 *
 * Worker de envio assíncrono de mensagens via message_outbox.
 *
 * Fluxo de status:
 *   pending ──► processing ──► sent          (sucesso)
 *                          └──► pending       (falha + tentativas restantes)
 *                          └──► dead          (MAX tentativas esgotadas)
 *
 * Garantias:
 *   - SELECT … FOR UPDATE SKIP LOCKED: evita processamento duplo entre réplicas.
 *   - Status 'processing' dentro da mesma transação: se o worker cair antes do
 *     UPDATE final, o registro fica em 'processing'. O poller tem recovery para
 *     mensagens travadas em 'processing' há mais de PROCESSING_STUCK_MINUTES.
 *   - provider_response, sent_at e last_error são sempre preenchidos.
 *   - Todos os logs incluem tenant_id, outbox_id e correlation_id.
 */

import { pool, withTenant } from '../db/pool.js';
import { env, isOutboxForceSendFailureRuntime } from '../../config/env.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const PROCESSING_STUCK_MINUTES = 10;

/** Atraso exponencial por nº de tentativa (0-indexed). */
export const RETRY_DELAYS_MS = [
  30_000,    // 30 s
  120_000,   // 2 min
  300_000,   // 5 min
  900_000,   // 15 min
  3_600_000, // 1 h
];

// ── Tipos internos ────────────────────────────────────────────────────────────

type OutboxRow = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  payload: { text?: string; type?: string };
  metadata: { instance_name?: string; phone?: string; provider?: string };
  attempts: number;
  max_attempts: number;
  correlation_id: string | null;
};

type SendResult =
  | { ok: true; providerResponse: unknown }
  | { ok: false; error: string };

// ── Envio via Evolution API ───────────────────────────────────────────────────

async function sendViaEvolution(
  instanceName: string,
  phone: string,
  text: string,
): Promise<unknown> {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
    throw new Error('Evolution API not configured (EVOLUTION_API_URL / EVOLUTION_API_KEY ausentes)');
  }
  const url = `${env.EVOLUTION_API_URL}/message/sendText/${instanceName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number: phone, text }),
  });
  const rawBody = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Evolution HTTP ${response.status}: ${rawBody}`);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

// ── Cálculo de backoff ────────────────────────────────────────────────────────

/** Retorna o atraso em ms para a próxima tentativa (após `attempts` falhas). */
export function nextRetryDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
}

// ── Processamento de uma mensagem ─────────────────────────────────────────────

export async function processRow(row: OutboxRow): Promise<void> {
  const logCtx = {
    outbox_id: row.id,
    tenant_id: row.tenant_id,
    correlation_id: row.correlation_id,
    attempts: row.attempts,
    provider: row.metadata?.provider ?? 'unknown',
  };

  const instanceName = row.metadata?.instance_name;
  const phone = row.metadata?.phone;
  const text = row.payload?.text;

  // Validação de campos obrigatórios — falha permanente (dead imediato)
  if (!instanceName || !phone || !text) {
    const error = `Campos obrigatórios ausentes no payload/metadata: ${
      [!instanceName && 'instance_name', !phone && 'phone', !text && 'payload.text']
        .filter(Boolean)
        .join(', ')
    }`;
    console.error('[outbox-worker] dead (campos ausentes)', { ...logCtx, error });
    await pool.query(
      `UPDATE message_outbox
          SET status           = 'dead',
              last_error       = $2,
              updated_at       = now()
        WHERE id = $1`,
      [row.id, error],
    );
    return;
  }

  // Tenta envio
  const result = await trySend(instanceName, phone, text);

  if (result.ok) {
    console.warn('[outbox-worker] sent', logCtx);
    await withTenant(row.tenant_id, async (client) => {
      await client.query(
        `UPDATE message_outbox
            SET status            = 'sent',
                attempts          = attempts + 1,
                sent_at           = now(),
                provider_response = $2::jsonb,
                last_error        = NULL,
                updated_at        = now()
          WHERE id = $1`,
        [row.id, JSON.stringify(result.providerResponse)],
      );
    });
  } else {
    const newAttempts = row.attempts + 1;
    const isDead = newAttempts >= row.max_attempts;
    const delayMs = nextRetryDelayMs(newAttempts);

    if (isDead) {
      console.error('[outbox-worker] dead (tentativas esgotadas)', { ...logCtx, error: result.error });
    } else {
      console.error('[outbox-worker] failed (retry agendado)', {
        ...logCtx,
        error: result.error,
        next_retry_in_ms: delayMs,
      });
    }

    await withTenant(row.tenant_id, async (client) => {
      await client.query(
        `UPDATE message_outbox
            SET status        = $2,
                attempts      = $3,
                last_error    = $4,
                next_retry_at = CASE WHEN $5 THEN NULL
                                     ELSE now() + ($6 || ' milliseconds')::interval
                                END,
                updated_at    = now()
          WHERE id = $1`,
        [
          row.id,
          isDead ? 'dead' : 'pending',
          newAttempts,
          result.error,
          isDead,
          delayMs,
        ],
      );
    });
  }
}

async function trySend(
  instanceName: string,
  phone: string,
  text: string,
): Promise<SendResult> {
  if (isOutboxForceSendFailureRuntime()) {
    return {
      ok: false,
      error: 'Simulated provider failure (OUTBOX_FORCE_SEND_FAILURE=true)',
    };
  }
  try {
    const providerResponse = await sendViaEvolution(instanceName, phone, text);
    return { ok: true, providerResponse };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Polling + lock transacional ───────────────────────────────────────────────

export async function pollOutbox(): Promise<void> {
  const client = await pool.connect();
  let rows: OutboxRow[] = [];

  try {
    await client.query('BEGIN');

    const result = await client.query<OutboxRow>(
      // Busca:
      //   (a) mensagens pendentes com next_retry_at vencido
      //   (b) mensagens em 'processing' há mais de PROCESSING_STUCK_MINUTES (recovery de crash)
      `SELECT id, tenant_id, customer_id, payload, metadata,
              attempts, max_attempts, correlation_id
         FROM message_outbox
        WHERE (
                (status = 'pending'     AND next_retry_at <= now())
             OR (status = 'processing'  AND updated_at    < now() - ($2 || ' minutes')::interval)
              )
          AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [env.OUTBOX_CONCURRENCY, PROCESSING_STUCK_MINUTES],
    );

    if (result.rows.length > 0) {
      await client.query(
        `UPDATE message_outbox
            SET status     = 'processing',
                updated_at = now()
          WHERE id = ANY($1::uuid[])`,
        [result.rows.map((r) => r.id)],
      );
    }

    await client.query('COMMIT');
    rows = result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[outbox-worker] erro no poll', err);
  } finally {
    client.release();
  }

  if (rows.length > 0) {
    await Promise.allSettled(rows.map(processRow));
  }
}

// ── Ponto de entrada ──────────────────────────────────────────────────────────

export function startOutboxWorker(): void {
  const intervalMs = env.OUTBOX_POLL_INTERVAL_MS;

  const run = () => {
    pollOutbox().catch((err: unknown) => {
      console.error('[outbox-worker] poll não capturado', err);
    });
  };

  run(); // execução imediata na inicialização
  setInterval(run, intervalMs);

  console.warn('[outbox-worker] iniciado', {
    poll_interval_ms: intervalMs,
    concurrency: env.OUTBOX_CONCURRENCY,
    stuck_recovery_minutes: PROCESSING_STUCK_MINUTES,
  });
}

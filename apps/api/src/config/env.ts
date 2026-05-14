import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Carrega `.env` em cascata para `npm run dev` em `apps/api` encontrar o ficheiro da raiz do monorepo.
 * Ordem (último sobrescreve): raiz do repo → `apps/api/.env` → `process.cwd()/.env`.
 */
function loadEnvFromKnownLocations(): void {
  const ordered = [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  const seen = new Set<string>();
  for (const filePath of ordered) {
    if (seen.has(filePath) || !existsSync(filePath)) continue;
    seen.add(filePath);
    dotenv.config({ path: filePath, override: true });
  }
}

loadEnvFromKnownLocations();

/** Alias opcional para QA/DevOps (`API_PORT` → `PORT`). */
if (
  (process.env.PORT === undefined || process.env.PORT === '') &&
  process.env.API_PORT !== undefined &&
  process.env.API_PORT !== ''
) {
  process.env.PORT = process.env.API_PORT;
}

function parseBoolish(val: unknown): boolean {
  if (val === undefined || val === '') return false;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
}

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  AUTH_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
  AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  AUTH_LOGOUT_RATE_LIMIT_MAX: z.coerce.number().default(30),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().default(15),
  REDIS_URL: z.string().min(1),
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  OUTBOX_CONCURRENCY: z.coerce.number().default(5),
  CORS_ORIGIN: z.string().default('*'),
  TENANT_DEFAULT_RPM: z.coerce.number().default(300),
  /** Webhook Pix: HMAC-SHA256 do corpo bruto. Em desenvolvimento pode ficar vazio (assinatura opcional). */
  PIX_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Waitlist: criar notification_jobs / WhatsApp ao libertar slot.
   * Default **false** — fora de escopo PO até nova decisão (ver docs/migrations/019_DEV_APPLICATION_CHECKLIST.md).
   */
  WAITLIST_SLOT_NOTIFY_ENABLED: z.preprocess((val) => {
    if (val === undefined || val === '') return false;
    const s = String(val).toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes';
  }, z.boolean()),
  /** Varredura periódica de fila de espera (consulta availability + notification_jobs). */
  WAITLIST_SWEEP_ENABLED: z.preprocess((val) => {
    if (val === undefined || val === '') return false;
    const s = String(val).toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes';
  }, z.boolean()),
  WAITLIST_SWEEP_INTERVAL_MS: z.coerce.number().min(30_000).default(120_000),
  WAITLIST_SWEEP_MAX_DAYS_AHEAD: z.coerce.number().min(1).max(60).default(14),
  WAITLIST_SWEEP_BATCH_PER_TENANT: z.coerce.number().min(1).max(500).default(40),
  /** Recall promocional (API POST /recall/send, n8n). Default false — não ativar sem QA/governança. */
  RECALL_ENABLED: z.preprocess(parseBoolish, z.boolean()),
  /** Bloqueio explícito de integração PIX real até decisão de PSP (ver docs/ADR_PIX_PROVIDER.md). */
  PIX_REAL_PROVIDER_ENABLED: z.preprocess(parseBoolish, z.boolean()),
});

/** Lê `RECALL_ENABLED` em tempo de pedido (útil para testes de integração sem reiniciar processo). */
export function isRecallEnabledRuntime(): boolean {
  return parseBoolish(process.env.RECALL_ENABLED);
}

/** Simula falha de envio ao provider (CT-101 / QA). Não marca `sent` sem tentativa real falhada. */
export function isOutboxForceSendFailureRuntime(): boolean {
  return parseBoolish(process.env.OUTBOX_FORCE_SEND_FAILURE);
}

export const env = schema.parse(process.env);

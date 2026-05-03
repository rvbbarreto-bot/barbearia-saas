import 'dotenv/config';
import { z } from 'zod';

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
});

export const env = schema.parse(process.env);

import { z } from 'zod';
import { OPERATIONAL_SETTINGS_DEFAULTS, type OperationalSettings } from './settings.defaults.js';

export const partialOperationalSchema = z.object({
  late_tolerance_minutes: z.number().int().min(0).max(240).optional(),
  advanced_no_show_policy: z.boolean().optional(),
  auto_no_show_grace_minutes: z.number().int().min(0).max(24 * 60).optional(),
  no_show_history_window_days: z.number().int().min(1).max(3650).optional(),
  no_show_threshold_for_restriction: z.number().int().min(1).max(100).optional(),
  auto_require_deposit_after_threshold: z.boolean().optional(),
  commission_enabled: z.boolean().optional(),
});

export function mergeOperational(raw: unknown): OperationalSettings {
  const base = { ...OPERATIONAL_SETTINGS_DEFAULTS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const parsed = partialOperationalSchema.safeParse(raw);
    if (parsed.success) {
      return { ...base, ...parsed.data };
    }
  }
  return base;
}

/** Extrai só as chaves operacionais de `tenant_settings.settings` (sem I/O). */
export function pickOperationalFromSettingsJson(settings: unknown): OperationalSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ...OPERATIONAL_SETTINGS_DEFAULTS };
  }
  const o = settings as Record<string, unknown>;
  return mergeOperational({
    late_tolerance_minutes: o.late_tolerance_minutes,
    advanced_no_show_policy: o.advanced_no_show_policy,
    auto_no_show_grace_minutes: o.auto_no_show_grace_minutes,
    no_show_history_window_days: o.no_show_history_window_days,
    no_show_threshold_for_restriction: o.no_show_threshold_for_restriction,
    auto_require_deposit_after_threshold: o.auto_require_deposit_after_threshold,
    commission_enabled: o.commission_enabled,
  });
}

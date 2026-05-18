import { z } from 'zod';
import type { CarWashTenantConfig, TenantVertical, TenantVerticalContext } from './types.js';
import { getVerticalLabels } from './labels.js';

const verticalSchema = z.enum(['barbershop', 'car_wash']);

const carWashConfigSchema = z.object({
  require_vehicle: z.boolean().default(true),
  require_checklist_on_arrival: z.boolean().default(true),
  notify_when_ready: z.boolean().default(true),
  default_slot_interval_minutes: z.number().int().min(5).max(240).default(30),
});

const tenantSettingsVerticalSchema = z.object({
  vertical: verticalSchema.default('barbershop'),
  labels: z.record(z.string(), z.string()).optional(),
  car_wash: carWashConfigSchema.optional(),
});

export const DEFAULT_CAR_WASH_CONFIG: CarWashTenantConfig = {
  require_vehicle: true,
  require_checklist_on_arrival: true,
  notify_when_ready: true,
  default_slot_interval_minutes: 30,
};

export function parseTenantVerticalFromSettings(settings: unknown): TenantVerticalContext {
  const parsed = tenantSettingsVerticalSchema.safeParse(settings ?? {});
  const vertical: TenantVertical = parsed.success ? parsed.data.vertical : 'barbershop';
  const carWashRaw = parsed.success ? parsed.data.car_wash : undefined;
  const car_wash = carWashConfigSchema.parse({ ...DEFAULT_CAR_WASH_CONFIG, ...carWashRaw });
  return {
    vertical,
    labels: getVerticalLabels(vertical),
    car_wash,
  };
}

export function isCarWashVertical(ctx: TenantVerticalContext): boolean {
  return ctx.vertical === 'car_wash';
}

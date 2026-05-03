import { z } from 'zod';

const uuidLike = () => z.string().uuid();

/** Catálogo de serviços — payloads da API REST */
const recallKindSchema = z.enum(['corte', 'barba', 'sobrancelha', 'estetica_quimica']).nullable().optional();

export const createServiceBodySchema = z.object({
  name: z.string().min(2).max(200),
  duration_minutes: z.number().int().min(5).max(480),
  price_cents: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  category_id: uuidLike().nullable().optional(),
  buffer_before_minutes: z.number().int().min(0).max(240).optional().default(0),
  buffer_after_minutes: z.number().int().min(0).max(240).optional().default(0),
  recall_kind: recallKindSchema,
  recall_min_days: z.number().int().min(1).max(730).nullable().optional(),
  recall_max_days: z.number().int().min(1).max(730).nullable().optional(),
});

export const updateServiceBodySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  price_cents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  category_id: uuidLike().nullable().optional(),
  buffer_before_minutes: z.number().int().min(0).max(240).optional(),
  buffer_after_minutes: z.number().int().min(0).max(240).optional(),
  recall_kind: recallKindSchema,
  recall_min_days: z.number().int().min(1).max(730).nullable().optional(),
  recall_max_days: z.number().int().min(1).max(730).nullable().optional(),
});

/** Substitui o conjunto de serviços vinculados ao profissional */
export const replaceProfessionalServicesBodySchema = z.object({
  service_ids: z.array(uuidLike()),
});

/** Adiciona vínculos (idempotente, ignora já existentes) */
export const addProfessionalServicesBodySchema = z.object({
  service_ids: z.array(uuidLike()).min(1),
});

/** Catálogo operacional vs perfis gerenciais (inactive listing) — tratado nas routes. */

export type CreateServiceBody = z.infer<typeof createServiceBodySchema>;
export type UpdateServiceBody = z.infer<typeof updateServiceBodySchema>;
export type ReplaceProfessionalServicesBody = z.infer<
  typeof replaceProfessionalServicesBodySchema
>;
export type AddProfessionalServicesBody = z.infer<typeof addProfessionalServicesBodySchema>;

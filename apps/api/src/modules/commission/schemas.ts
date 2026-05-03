import { z } from 'zod';

export const commissionRuleKindSchema = z.enum(['percent', 'fixed_cents']);

export const createCommissionRuleSchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  professional_id: z.string().uuid().nullable().optional(),
  service_id: z.string().uuid().nullable().optional(),
  rule_kind: commissionRuleKindSchema,
  percent_basis_points: z.number().int().min(0).max(10000).nullable().optional(),
  fixed_cents: z.number().int().min(0).nullable().optional(),
  priority: z.number().int().default(0),
  active: z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  if (data.rule_kind === 'percent') {
    if (data.percent_basis_points == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'percent_basis_points obrigatório para rule_kind percent.',
        path: ['percent_basis_points'],
      });
    }
    if (data.fixed_cents != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fixed_cents deve ser nulo para percent.',
        path: ['fixed_cents'],
      });
    }
  } else {
    if (data.fixed_cents == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fixed_cents obrigatório para fixed_cents.',
        path: ['fixed_cents'],
      });
    }
    if (data.percent_basis_points != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'percent_basis_points deve ser nulo para fixed_cents.',
        path: ['percent_basis_points'],
      });
    }
  }
});

export const patchCommissionRuleSchema = createCommissionRuleSchema.partial();

export const commissionEntryStatusSchema = z.enum(['pending', 'approved', 'paid', 'cancelled']);

export const patchCommissionEntryStatusSchema = z.object({
  status: commissionEntryStatusSchema,
});

export const dateRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const computeClosingBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

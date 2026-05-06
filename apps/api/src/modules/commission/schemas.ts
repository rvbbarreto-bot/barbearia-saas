import { z } from 'zod';

export const commissionRuleKindSchema = z.enum(['percent', 'fixed_cents']);

/** Objeto base sem refinamento — Zod v4 não permite `.partial()` em schemas com `.superRefine()`. */
const commissionRuleBaseSchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  professional_id: z.string().uuid().nullable().optional(),
  service_id: z.string().uuid().nullable().optional(),
  rule_kind: commissionRuleKindSchema,
  percent_basis_points: z.number().int().min(0).max(10000).nullable().optional(),
  fixed_cents: z.number().int().min(0).nullable().optional(),
  priority: z.number().int().default(0),
  active: z.boolean().optional().default(true),
});

function refineCommissionRuleKindConsistency(
  data: z.infer<typeof commissionRuleBaseSchema>,
  ctx: z.RefinementCtx,
): void {
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
}

export const createCommissionRuleSchema = commissionRuleBaseSchema.superRefine(refineCommissionRuleKindConsistency);

/** PATCH parcial: refinamento só quando `rule_kind` está presente no payload. */
export const patchCommissionRuleSchema = commissionRuleBaseSchema.partial().superRefine((data, ctx) => {
  if (data.rule_kind === undefined) return;
  refineCommissionRuleKindConsistency(
    {
      branch_id: data.branch_id ?? null,
      professional_id: data.professional_id ?? null,
      service_id: data.service_id ?? null,
      rule_kind: data.rule_kind,
      percent_basis_points: data.percent_basis_points ?? null,
      fixed_cents: data.fixed_cents ?? null,
      priority: data.priority ?? 0,
      active: data.active ?? true,
    },
    ctx,
  );
});

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

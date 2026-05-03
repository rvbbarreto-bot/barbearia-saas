import { z } from 'zod';

export const balancePaymentMethodSchema = z.enum(['cash', 'pix', 'debit', 'credit', 'other']);

export const settleFinanceSchema = z.object({
  balance_payment_method: balancePaymentMethodSchema,
  balance_collected_cents: z.number().int().min(0).optional(),
});

export const discountFinanceSchema = z
  .object({
    discount_cents: z.number().int().min(0),
    discount_reason: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.discount_cents > 0 && (!data.discount_reason || data.discount_reason.trim().length < 10)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Motivo obrigatório (mín. 10 caracteres) quando há desconto/cortesia.',
        path: ['discount_reason'],
      });
    }
  });

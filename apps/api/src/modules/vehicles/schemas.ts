import { z } from 'zod';
import { isValidBrazilianPlate } from './plate.js';

const vehicleTypeSchema = z.enum(['car', 'motorcycle', 'pickup', 'suv', 'van', 'truck', 'other']);

export const createVehicleSchema = z
  .object({
    customer_id: z.string().uuid(),
    plate: z.string().min(1).max(12),
    brand: z.string().max(80).optional(),
    model: z.string().max(80).optional(),
    color: z.string().max(40).optional(),
    vehicle_type: vehicleTypeSchema.default('car'),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (!isValidBrazilianPlate(data.plate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Placa inválida (formato Mercosul ou antigo).',
        path: ['plate'],
      });
    }
  });

export const updateVehicleSchema = z
  .object({
    plate: z.string().min(1).max(12).optional(),
    brand: z.string().max(80).optional(),
    model: z.string().max(80).optional(),
    color: z.string().max(40).optional(),
    vehicle_type: vehicleTypeSchema.optional(),
    notes: z.string().max(2000).optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.plate !== undefined && data.plate && !isValidBrazilianPlate(data.plate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Placa inválida (formato Mercosul ou antigo).',
        path: ['plate'],
      });
    }
  });

/** Campos mínimos obrigatórios do checklist MVP (entrada e entrega). */
export const checklistItemsSchema = z.object({
  body_scratches: z.boolean(),
  fuel_level: z.string().min(1).max(40),
  wheel_damage: z.boolean(),
  interior_objects: z.string().min(1).max(500),
  general_notes: z.string().max(2000).optional(),
});

export const createChecklistSchema = z.object({
  checklist_type: z.enum(['arrival', 'delivery']),
  items: checklistItemsSchema,
  notes: z.string().max(2000).optional(),
});

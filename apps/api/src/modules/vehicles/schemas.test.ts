import { describe, expect, it } from 'vitest';
import { createChecklistSchema, createVehicleSchema, updateVehicleSchema } from './schemas.js';

describe('createVehicleSchema', () => {
  it('exige placa', () => {
    const r = createVehicleSchema.safeParse({
      customer_id: '00000000-0000-4000-8000-000000000001',
    });
    expect(r.success).toBe(false);
  });

  it('valida placa Mercosul', () => {
    const r = createVehicleSchema.safeParse({
      customer_id: '00000000-0000-4000-8000-000000000001',
      plate: 'ABC1D23',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita placa inválida', () => {
    const r = createVehicleSchema.safeParse({
      customer_id: '00000000-0000-4000-8000-000000000001',
      plate: 'XX',
    });
    expect(r.success).toBe(false);
  });
});

describe('createChecklistSchema', () => {
  it('aceita campos mínimos do MVP', () => {
    const r = createChecklistSchema.safeParse({
      checklist_type: 'arrival',
      items: {
        body_scratches: true,
        fuel_level: '1/2',
        wheel_damage: false,
        interior_objects: 'Nenhum',
        general_notes: 'OK',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejeita checklist sem fuel_level', () => {
    const r = createChecklistSchema.safeParse({
      checklist_type: 'arrival',
      items: {
        body_scratches: true,
        wheel_damage: false,
        interior_objects: 'Nenhum',
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('updateVehicleSchema', () => {
  it('aceita atualização com plate válida', () => {
    const r = updateVehicleSchema.safeParse({
      plate: 'ABC1D23',
      brand: 'Honda',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita plate inválida quando enviada', () => {
    const r = updateVehicleSchema.safeParse({
      plate: 'XX',
    });
    expect(r.success).toBe(false);
  });
});

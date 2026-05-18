import { describe, expect, it } from 'vitest';
import {
  formatVehicleLabel,
  isValidBrazilianPlate,
  normalizePlate,
  sampleBrazilianPlate,
} from './plate.js';

describe('normalizePlate', () => {
  it('remove espaços e hífen e aplica upper-case', () => {
    expect(normalizePlate('abc-1d23')).toBe('ABC1D23');
    expect(normalizePlate(' abc 1d23 ')).toBe('ABC1D23');
  });

  it('retorna null para vazio', () => {
    expect(normalizePlate('')).toBeNull();
    expect(normalizePlate(undefined)).toBeNull();
  });
});

describe('isValidBrazilianPlate', () => {
  it('aceita Mercosul e antiga', () => {
    expect(isValidBrazilianPlate('ABC1D23')).toBe(true);
    expect(isValidBrazilianPlate('ABC1234')).toBe(true);
  });

  it('rejeita formato inválido', () => {
    expect(isValidBrazilianPlate('AB123')).toBe(false);
  });
});

describe('sampleBrazilianPlate', () => {
  it('gera placa válida', () => {
    expect(isValidBrazilianPlate(sampleBrazilianPlate())).toBe(true);
  });
});

describe('formatVehicleLabel', () => {
  it('monta label com placa e modelo', () => {
    expect(formatVehicleLabel({ plate: 'ABC1D23', brand: 'Honda', model: 'Civic', color: 'Prata' })).toContain(
      'ABC1D23',
    );
  });
});

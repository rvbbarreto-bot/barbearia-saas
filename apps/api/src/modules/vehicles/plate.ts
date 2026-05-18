/** Placa BR: 3 letras + 1 dígito + 1 alfanum + 2 dígitos (Mercosul e antiga normalizada). */
export const PLATE_BR = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate?.trim()) return null;
  const normalized = plate.replace(/[\s-]/g, '').toUpperCase();
  return normalized.length ? normalized : null;
}

export function isValidBrazilianPlate(plate: string | null | undefined): boolean {
  const n = normalizePlate(plate);
  if (!n) return false;
  return PLATE_BR.test(n);
}

export function formatVehicleLabel(parts: {
  plate?: string | null;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
}): string {
  const plate = parts.plate?.trim() || normalizePlate(parts.plate) || '';
  const model = [parts.brand, parts.model].filter(Boolean).join(' ').trim();
  const color = parts.color?.trim();
  if (plate && model) return color ? `${plate} · ${model} (${color})` : `${plate} · ${model}`;
  if (plate) return plate;
  if (model) return color ? `${model} (${color})` : model;
  return 'Veículo';
}

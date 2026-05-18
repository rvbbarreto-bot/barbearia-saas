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

/** Placa Mercosul válida para testes (evita UUID em posições que exigem dígito). */
export function sampleBrazilianPlate(prefix = 'ABC'): string {
  const letters = prefix.replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3);
  const digit = Math.floor(Math.random() * 10);
  const mid = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const tail = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${letters}${digit}${mid}${tail}`;
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

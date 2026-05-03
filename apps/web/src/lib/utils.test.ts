import { describe, expect, it } from 'vitest';
import { cn, formatDate, formatDateTime, formatPhone } from './utils';

describe('cn (class merging)', () => {
  it('retorna string vazia sem argumentos', () => {
    expect(cn()).toBe('');
  });

  it('concatena classes simples', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('descarta valores falsy', () => {
    expect(cn('a', undefined, null, false, 'b')).toBe('a b');
  });

  it('resolve conflito tailwind (ultimo vence)', () => {
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
  });

  it('resolve conflito de cor tailwind', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });
});

describe('formatDate', () => {
  it('formata data ISO para dd/mm/aaaa', () => {
    const result = formatDate(new Date(2026, 0, 15));
    expect(result).toBe('15/01/2026');
  });

  it('aceita objeto Date', () => {
    const result = formatDate(new Date(2026, 0, 15));
    expect(result).toBe('15/01/2026');
  });
});

describe('formatDateTime', () => {
  it('retorna string nao vazia para data valida', () => {
    const result = formatDateTime('2026-01-15T10:30:00');
    expect(result).toMatch(/15\/01\/2026/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatPhone', () => {
  it('formata celular com 11 digitos', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
  });

  it('formata fixo com 10 digitos', () => {
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890');
  });

  it('retorna original se formato desconhecido', () => {
    expect(formatPhone('123')).toBe('123');
  });

  it('ignora caracteres nao numericos antes de formatar', () => {
    expect(formatPhone('(11) 9.8765-4321')).toBe('(11) 98765-4321');
  });
});

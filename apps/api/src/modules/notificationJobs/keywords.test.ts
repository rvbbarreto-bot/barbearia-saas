import { describe, expect, it } from 'vitest';
import { matchOptOutKeyword, normalizeInboundText } from './keywords.js';

describe('opt-out keyword detection', () => {
  it('matches parar / sair / cancelar mensagens / nao quero receber', () => {
    expect(matchOptOutKeyword('por favor parar')).toBe('parar');
    expect(matchOptOutKeyword('quero sair da lista')).toBe('sair');
    expect(matchOptOutKeyword('Cancelar mensagens para mim')).toBe('cancelar mensagens');
    expect(matchOptOutKeyword('Não quero receber mais nada')).toBe('nao quero receber');
  });

  it('normalizes accents before matching', () => {
    expect(normalizeInboundText('Não quero receber')).toContain('nao quero receber');
    expect(matchOptOutKeyword('não quero receber promoções')).toBe('nao quero receber');
  });

  it('returns null for unrelated content', () => {
    expect(matchOptOutKeyword('quero marcar corte amanhã')).toBeNull();
  });
});

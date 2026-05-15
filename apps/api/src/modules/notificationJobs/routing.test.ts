import { afterEach, describe, expect, it } from 'vitest';
import { resolveEvolutionInstanceName } from './routing.js';

describe('resolveEvolutionInstanceName', () => {
  const prev = process.env.EVOLUTION_INSTANCE;

  afterEach(() => {
    if (prev === undefined) delete process.env.EVOLUTION_INSTANCE;
    else process.env.EVOLUTION_INSTANCE = prev;
  });

  it('prefere EVOLUTION_INSTANCE do ambiente sobre DB', () => {
    process.env.EVOLUTION_INSTANCE = 'teste';
    expect(resolveEvolutionInstanceName('demo-qa-inbound')).toBe('teste');
  });

  it('usa instance_name do DB quando env ausente', () => {
    delete process.env.EVOLUTION_INSTANCE;
    expect(resolveEvolutionInstanceName('demo-qa-inbound')).toBe('demo-qa-inbound');
  });

  it('retorna null sem env nem DB', () => {
    delete process.env.EVOLUTION_INSTANCE;
    expect(resolveEvolutionInstanceName(null)).toBeNull();
    expect(resolveEvolutionInstanceName('  ')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

function stepKinds(isCarWash: boolean): string[] {
  return isCarWash
    ? ['customer', 'vehicle', 'service', 'professional', 'slot']
    : ['customer', 'service', 'professional', 'slot'];
}

describe('appointment modal steps', () => {
  it('barbershop não inclui passo veículo', () => {
    expect(stepKinds(false)).not.toContain('vehicle');
    expect(stepKinds(false)).toHaveLength(4);
  });

  it('car_wash inclui passo veículo', () => {
    expect(stepKinds(true)).toContain('vehicle');
    expect(stepKinds(true)).toHaveLength(5);
  });
});

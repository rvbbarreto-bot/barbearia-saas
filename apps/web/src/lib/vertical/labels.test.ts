import { describe, expect, it } from 'vitest';
import { getVerticalLabels } from './labels';

describe('getVerticalLabels', () => {
  it('usa Box/equipe para car_wash', () => {
    const labels = getVerticalLabels('car_wash');
    expect(labels.professional).toBe('Box/equipe');
    expect(labels.patio).toBe('Pátio');
  });

  it('mantém Profissional para barbershop', () => {
    const labels = getVerticalLabels('barbershop');
    expect(labels.professional).toBe('Profissional');
  });
});

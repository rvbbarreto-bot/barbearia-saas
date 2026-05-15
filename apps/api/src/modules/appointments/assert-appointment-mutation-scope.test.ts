import { beforeEach, describe, expect, it, vi } from 'vitest';

const scopeMocks = vi.hoisted(() => ({
  resolveAppointmentProfessionalFilter: vi.fn(),
}));

vi.mock('./appointment-list-scope.js', () => ({
  resolveAppointmentProfessionalFilter: scopeMocks.resolveAppointmentProfessionalFilter,
}));

import { assertAppointmentMutationScope } from './assert-appointment-mutation-scope.js';

describe('assertAppointmentMutationScope', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const profA = '00000000-0000-4000-8000-000000004011';
  const profB = '00000000-0000-4000-8000-000000004012';

  beforeEach(() => {
    scopeMocks.resolveAppointmentProfessionalFilter.mockReset();
  });

  it('ignora roles que não são professional', async () => {
    await expect(
      assertAppointmentMutationScope(
        tenantId,
        { professional_id: profB },
        { role: 'attendant', sub: 'u1' },
      ),
    ).resolves.toBeUndefined();
    expect(scopeMocks.resolveAppointmentProfessionalFilter).not.toHaveBeenCalled();
  });

  it('permite professional no próprio agendamento', async () => {
    scopeMocks.resolveAppointmentProfessionalFilter.mockResolvedValueOnce(profA);
    await expect(
      assertAppointmentMutationScope(
        tenantId,
        { professional_id: profA },
        { role: 'professional', sub: 'u1', professional_id: profA },
      ),
    ).resolves.toBeUndefined();
  });

  it('nega professional em agendamento de outro profissional', async () => {
    scopeMocks.resolveAppointmentProfessionalFilter.mockResolvedValueOnce(profA);
    await expect(
      assertAppointmentMutationScope(
        tenantId,
        { professional_id: profB },
        { role: 'professional', sub: 'u1', professional_id: profA },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });
});

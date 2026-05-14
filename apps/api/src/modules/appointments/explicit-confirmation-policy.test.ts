import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import { validateImplicitAppointmentConfirmation } from './explicit-confirmation-policy.js';

describe('validateImplicitAppointmentConfirmation (CT-073 / CT-073-B)', () => {
  it('allows true without checks', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation(
        { explicit_confirmation: true, source: 'manual' },
        { sub: 'u1', role: 'viewer' },
      ),
    ).not.toThrow();
  });

  it('allows false for tenant_owner on manual', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation(
        { explicit_confirmation: false, source: 'manual' },
        { sub: 'u1', role: 'tenant_owner' },
      ),
    ).not.toThrow();
  });

  it('allows false for walk_in with attendant', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation(
        { explicit_confirmation: false, source: 'walk_in' },
        { sub: 'u1', role: 'attendant' },
      ),
    ).not.toThrow();
  });

  it('blocks false for attendant on manual (CT-073-B)', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation(
        { explicit_confirmation: false, source: 'manual' },
        { sub: 'u1', role: 'attendant' },
      ),
    ).toThrow(AppError);
  });

  it('blocks false for manager on manual', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation(
        { explicit_confirmation: false, source: 'manual' },
        { sub: 'u1', role: 'manager' },
      ),
    ).toThrow(AppError);
  });

  it('blocks false for professional even on walk_in', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation(
        { explicit_confirmation: false, source: 'walk_in' },
        { sub: 'u1', role: 'professional' },
      ),
    ).toThrow(AppError);
  });

  it('blocks without sub', () => {
    expect(() =>
      validateImplicitAppointmentConfirmation({ explicit_confirmation: false, source: 'manual' }, {
        role: 'tenant_owner',
      }),
    ).toThrow(AppError);
  });
});

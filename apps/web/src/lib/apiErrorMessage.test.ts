import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './apiErrorMessage';

describe('getApiErrorMessage', () => {
  it('maps known API error codes', () => {
    const err = new axios.AxiosError('x', 'ERR', {}, {}, {
      status: 409,
      data: { error: 'SLOT_UNAVAILABLE', message: 'slot' },
    } as never);
    expect(getApiErrorMessage(err)).toContain('Horário indisponível');
  });

  it('maps APPOINTMENT_IN_PAST', () => {
    const err = new axios.AxiosError('x', 'ERR', {}, {}, {
      status: 422,
      data: { error: 'APPOINTMENT_IN_PAST' },
    } as never);
    expect(getApiErrorMessage(err)).toContain('passado');
  });

  it('maps FORBIDDEN for agenda scope', () => {
    const err = new axios.AxiosError('x', 'ERR', {}, {}, {
      status: 403,
      data: { error: 'FORBIDDEN' },
    } as never);
    expect(getApiErrorMessage(err)).toContain('permissão');
  });

  it('maps TENANT_MISMATCH from 403', () => {
    const err = new axios.AxiosError('x', 'ERR', {}, {}, {
      status: 403,
      data: { error: 'TENANT_MISMATCH' },
    } as never);
    expect(getApiErrorMessage(err)).toContain('unidade');
  });

  it('maps VEHICLE_PLATE_ALREADY_EXISTS', () => {
    const err = new axios.AxiosError('x', 'ERR', {}, {}, {
      status: 409,
      data: { error: 'VEHICLE_PLATE_ALREADY_EXISTS', message: 'Placa já cadastrada neste tenant.' },
    } as never);
    expect(getApiErrorMessage(err)).toContain('placa');
  });

  it('maps INTERNAL_ERROR without leaking raw message', () => {
    const err = new axios.AxiosError('Request failed', 'ERR', {}, {}, {
      status: 500,
      data: { error: 'INTERNAL_ERROR', message: 'Unexpected' },
    } as never);
    const m = getApiErrorMessage(err);
    expect(m.toLowerCase()).not.toContain('axios');
    expect(m).toContain('Não foi possível');
  });
});

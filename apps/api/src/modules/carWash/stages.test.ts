import { describe, expect, it } from 'vitest';
import {
  assertCarWashStageTransition,
  CarWashStageError,
  STAGE_ACTION_MAP,
} from './stages.js';

describe('car wash FSM', () => {
  it('permite scheduled → arrived', () => {
    expect(() => assertCarWashStageTransition('scheduled', 'arrived')).not.toThrow();
  });

  it('bloqueia scheduled → ready', () => {
    expect(() => assertCarWashStageTransition('scheduled', 'ready')).toThrow(CarWashStageError);
  });

  it('mapeia ações de API', () => {
    expect(STAGE_ACTION_MAP.ready.to).toBe('ready');
    expect(STAGE_ACTION_MAP.deliver.from).toContain('ready');
  });
});

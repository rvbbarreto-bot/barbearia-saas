export const CAR_WASH_STAGES = [
  'scheduled',
  'arrived',
  'washing',
  'quality_check',
  'ready',
  'delivered',
  'cancelled',
  'no_show',
] as const;

export type CarWashStage = (typeof CAR_WASH_STAGES)[number];

const TERMINAL: CarWashStage[] = ['delivered', 'cancelled', 'no_show'];

const ALLOWED: Record<CarWashStage, CarWashStage[]> = {
  scheduled: ['arrived', 'cancelled', 'no_show'],
  arrived: ['washing', 'cancelled'],
  washing: ['quality_check', 'cancelled'],
  quality_check: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  no_show: [],
};

export function assertCarWashStageTransition(from: CarWashStage, to: CarWashStage): void {
  if (from === to) return;
  if (TERMINAL.includes(from)) {
    throw new CarWashStageError(
      `Transição inválida: estágio terminal '${from}' não permite mudança para '${to}'.`,
    );
  }
  if (!ALLOWED[from].includes(to)) {
    throw new CarWashStageError(
      `Transição inválida: '${from}' não pode ir direto para '${to}'.`,
    );
  }
}

export class CarWashStageError extends Error {
  readonly statusCode = 422;
  readonly code = 'INVALID_CAR_WASH_STAGE_TRANSITION';
  constructor(message: string) {
    super(message);
    this.name = 'CarWashStageError';
  }
}

export const STAGE_ACTION_MAP = {
  arrive: { from: ['scheduled'] as CarWashStage[], to: 'arrived' as CarWashStage },
  start: { from: ['arrived'] as CarWashStage[], to: 'washing' as CarWashStage },
  'quality-check': { from: ['washing'] as CarWashStage[], to: 'quality_check' as CarWashStage },
  ready: { from: ['quality_check'] as CarWashStage[], to: 'ready' as CarWashStage },
  deliver: { from: ['ready'] as CarWashStage[], to: 'delivered' as CarWashStage },
  cancel: {
    from: ['scheduled', 'arrived', 'washing', 'quality_check', 'ready'] as CarWashStage[],
    to: 'cancelled' as CarWashStage,
  },
} as const;

export type CarWashStageAction = keyof typeof STAGE_ACTION_MAP;

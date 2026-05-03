export type TimeRange = { startsAt: Date; endsAt: Date };

export function hasOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function buildSlots(input: {
  dayStart: Date;
  dayEnd: Date;
  durationMinutes: number;
  /** Minutos antes do início nominal do serviço que entram na “pegada” de agenda */
  bufferBeforeMinutes?: number;
  /** Minutos após o fim nominal do serviço que entram na pegada */
  bufferAfterMinutes?: number;
  stepMinutes: number;
  blocked: TimeRange[];
}): TimeRange[] {
  const slots: TimeRange[] = [];
  const durationMs = input.durationMinutes * 60 * 1000;
  const stepMs = input.stepMinutes * 60 * 1000;
  const bBefore = (input.bufferBeforeMinutes ?? 0) * 60 * 1000;
  const bAfter = (input.bufferAfterMinutes ?? 0) * 60 * 1000;

  for (let cursor = input.dayStart.getTime(); cursor + durationMs <= input.dayEnd.getTime(); cursor += stepMs) {
    const nominalStartMs = cursor;
    const nominalEndMs = cursor + durationMs;

    /** Janela de bloqueio usada contra conflitos (folgas/agendamentos) */
    const footprint: TimeRange = {
      startsAt: new Date(nominalStartMs - bBefore),
      endsAt: new Date(nominalEndMs + bAfter),
    };

    const conflict = input.blocked.some((b) => hasOverlap(footprint, b));
    if (!conflict) {
      slots.push({
        startsAt: new Date(nominalStartMs),
        endsAt: new Date(nominalEndMs),
      });
    }
  }

  return slots;
}

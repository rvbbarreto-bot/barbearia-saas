/** Evita crash do processo quando Postgres/Redis estão indisponíveis no sweep inicial. */
export async function runSweepSafely(workerName: string, sweep: () => Promise<void>): Promise<void> {
  try {
    await sweep();
  } catch (err) {
    console.error(`[${workerName}] sweep failed`, err);
  }
}

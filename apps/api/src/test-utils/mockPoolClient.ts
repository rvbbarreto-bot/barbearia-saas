import { vi } from 'vitest';
import type { PoolClient } from 'pg';

export type FakeRow = Record<string, unknown>;
export type FakeQueryResult = { rows?: FakeRow[]; rowCount?: number } | null;

/** Cliente PG mínimo para testes unitários PS-06 (compatível com `tsc --noEmit` no CI). */
export function mockPoolClient(
  resolver: (sql: string, params?: unknown[]) => FakeQueryResult,
): PoolClient {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const r = resolver(String(sql), params);
    if (!r) return { rows: [], rowCount: 0 };
    return {
      rows: (r.rows ?? []) as FakeRow[],
      rowCount: r.rowCount ?? (r.rows ? r.rows.length : 0),
    };
  });
  return { query } as unknown as PoolClient;
}

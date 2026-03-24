import { query } from '../db/connection';

export interface SlowQuery {
  query: string;
  calls: number;
  avg_time_ms: number;
  total_time_ms: number;
  min_time_ms: number;
  max_time_ms: number;
  rows_per_call: number;
  cache_hit_ratio: string;
}

export interface SlowQueryOptions {
  limit?: number;
  minCalls?: number;
  minAvgMs?: number;
}

/**
 * Fetches slow queries from pg_stat_statements.
 * Requires the pg_stat_statements extension to be enabled.
 * Add to postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
 */
export async function getSlowQueries(
  opts: SlowQueryOptions = {},
): Promise<SlowQuery[]> {
  const limit = opts.limit ?? 10;
  const minCalls = opts.minCalls ?? 1;
  const minAvgMs = opts.minAvgMs ?? 0;

  // Check if pg_stat_statements is available
  await checkExtension();

  const sql = `
    SELECT
      query,
      calls,
      ROUND((mean_exec_time)::numeric, 2)        AS avg_time_ms,
      ROUND((total_exec_time)::numeric, 2)        AS total_time_ms,
      ROUND((min_exec_time)::numeric, 2)          AS min_time_ms,
      ROUND((max_exec_time)::numeric, 2)          AS max_time_ms,
      ROUND((rows / NULLIF(calls, 0))::numeric, 1) AS rows_per_call,
      ROUND(
        (shared_blks_hit::numeric /
         NULLIF(shared_blks_hit + shared_blks_read, 0)) * 100, 1
      )::text || '%'                               AS cache_hit_ratio
    FROM pg_stat_statements
    WHERE calls >= $1
      AND mean_exec_time >= $2
      AND query NOT ILIKE '%pg_stat_statements%'
      AND query NOT ILIKE '%pg_stat%'
    ORDER BY mean_exec_time DESC
    LIMIT $3;
  `;

  return query<SlowQuery>(sql, [minCalls, minAvgMs, limit]);
}

/**
 * Resets pg_stat_statements counters (requires superuser or pg_monitor role)
 */
export async function resetStats(): Promise<void> {
  await query('SELECT pg_stat_statements_reset()');
}

/**
 * Checks if pg_stat_statements extension is installed and active
 */
async function checkExtension(): Promise<void> {
  const rows = await query<{ count: string }>(`
    SELECT COUNT(*) as count
    FROM pg_extension
    WHERE extname = 'pg_stat_statements'
  `);

  if (parseInt(rows[0].count) === 0) {
    throw new Error(
      'pg_stat_statements extension is not installed.\n' +
        '  Fix: Run  CREATE EXTENSION pg_stat_statements;  as superuser.\n' +
        "  Also add  shared_preload_libraries = 'pg_stat_statements'  to postgresql.conf and restart.",
    );
  }
}

/**
 * Returns top queries by total time (most expensive overall, not per-call)
 */
export async function getMostExpensiveQueries(
  limit = 10,
): Promise<SlowQuery[]> {
  await checkExtension();

  const sql = `
    SELECT
      query,
      calls,
      ROUND((mean_exec_time)::numeric, 2)         AS avg_time_ms,
      ROUND((total_exec_time)::numeric, 2)         AS total_time_ms,
      ROUND((min_exec_time)::numeric, 2)           AS min_time_ms,
      ROUND((max_exec_time)::numeric, 2)           AS max_time_ms,
      ROUND((rows / NULLIF(calls, 0))::numeric, 1) AS rows_per_call,
      ROUND(
        (shared_blks_hit::numeric /
         NULLIF(shared_blks_hit + shared_blks_read, 0)) * 100, 1
      )::text || '%'                               AS cache_hit_ratio
    FROM pg_stat_statements
    WHERE query NOT ILIKE '%pg_stat%'
    ORDER BY total_exec_time DESC
    LIMIT $1;
  `;

  return query<SlowQuery>(sql, [limit]);
}

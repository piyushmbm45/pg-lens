import { query } from '../db/connection';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MissingIndex {
  schema: string;
  table: string;
  seq_scans: number;
  seq_rows_read: number;
  index_scans: number;
  live_rows: number;
  suggestion: string;
}

export interface UnusedIndex {
  schema: string;
  table: string;
  index: string;
  index_size: string;
  index_scans: number;
  suggestion: string;
}

export interface IndexBloat {
  schema: string;
  table: string;
  index: string;
  index_size: string;
  bloat_ratio: string;
  suggestion: string;
}

export interface MissingIndexOptions {
  minRows?: number; // minimum live rows to consider (avoid noise on tiny tables)
  minSeqScans?: number; // minimum sequential scans
  limit?: number;
}

export interface UnusedIndexOptions {
  minSize?: number; // minimum index size in bytes to report
  limit?: number;
}

// ─── Missing Indexes ─────────────────────────────────────────────────────────

/**
 * Finds tables with high sequential scans relative to index scans.
 * High seq_scan on a large table = strong signal for a missing index.
 */
export async function getMissingIndexes(
  opts: MissingIndexOptions = {},
): Promise<MissingIndex[]> {
  const minRows = opts.minRows ?? 10000;
  const minSeqScans = opts.minSeqScans ?? 50;
  const limit = opts.limit ?? 20;

  const sql = `
    SELECT
      schemaname                                        AS schema,
      relname                                           AS table,
      seq_scan                                          AS seq_scans,
      seq_tup_read                                      AS seq_rows_read,
      COALESCE(idx_scan, 0)                             AS index_scans,
      n_live_tup                                        AS live_rows,
      'CREATE INDEX CONCURRENTLY ON '
        || schemaname || '.' || relname
        || ' (<your_filter_column>);'                   AS suggestion
    FROM pg_stat_user_tables
    WHERE
      n_live_tup   > $1
      AND seq_scan > $2
      AND (idx_scan IS NULL OR seq_scan > idx_scan)
    ORDER BY seq_tup_read DESC
    LIMIT $3;
  `;

  return query<MissingIndex>(sql, [minRows, minSeqScans, limit]);
}

// ─── Unused Indexes ───────────────────────────────────────────────────────────

/**
 * Finds indexes that have never been scanned since the last stats reset.
 * These waste storage and slow down writes — safe candidates for removal.
 */
export async function getUnusedIndexes(
  opts: UnusedIndexOptions = {},
): Promise<UnusedIndex[]> {
  const minSizeBytes = opts.minSize ?? 8192; // at least 1 page (8KB)
  const limit = opts.limit ?? 20;

  const sql = `
    SELECT
      s.schemaname                                          AS schema,
      s.relname                                             AS table,
      s.indexrelname                                        AS index,
      pg_size_pretty(pg_relation_size(s.indexrelid))        AS index_size,
      s.idx_scan                                            AS index_scans,
      'DROP INDEX CONCURRENTLY '
        || s.schemaname || '.' || s.indexrelname || ';'     AS suggestion
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE
      s.idx_scan = 0
      AND NOT i.indisprimary
      AND NOT i.indisunique
      AND pg_relation_size(s.indexrelid) >= $1
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT $2;
  `;

  return query<UnusedIndex>(sql, [minSizeBytes, limit]);
}

// ─── Duplicate Indexes ────────────────────────────────────────────────────────

export interface DuplicateIndex {
  schema: string;
  table: string;
  index: string;
  duplicate_of: string;
  index_size: string;
  suggestion: string;
}

/**
 * Finds indexes with identical column sets — one of them is redundant.
 */
export async function getDuplicateIndexes(): Promise<DuplicateIndex[]> {
  const sql = `
    SELECT
      n.nspname                                             AS schema,
      t.relname                                             AS table,
      i1.relname                                            AS index,
      i2.relname                                            AS duplicate_of,
      pg_size_pretty(pg_relation_size(ix1.indexrelid))      AS index_size,
      'DROP INDEX CONCURRENTLY '
        || n.nspname || '.' || i1.relname || ';'            AS suggestion
    FROM
      pg_index ix1
      JOIN pg_index     ix2 ON ix1.indrelid  = ix2.indrelid
                           AND ix1.indkey    = ix2.indkey
                           AND ix1.indexrelid < ix2.indexrelid
      JOIN pg_class     i1  ON i1.oid = ix1.indexrelid
      JOIN pg_class     i2  ON i2.oid = ix2.indexrelid
      JOIN pg_class     t   ON t.oid  = ix1.indrelid
      JOIN pg_namespace n   ON n.oid  = t.relnamespace
    WHERE
      n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_relation_size(ix1.indexrelid) DESC;
  `;

  return query<DuplicateIndex>(sql);
}

// ─── Index Health Summary ─────────────────────────────────────────────────────

export interface IndexHealthSummary {
  total_indexes: number;
  unused_indexes: number;
  tables_missing_indexes: number;
  duplicate_indexes: number;
  total_index_size: string;
  wasted_index_size: string;
}

/**
 * Returns a quick health summary of all indexes in the database.
 */
export async function getIndexHealthSummary(): Promise<IndexHealthSummary> {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM pg_stat_user_indexes)                        AS total_indexes,

      (SELECT COUNT(*)
       FROM pg_stat_user_indexes s
       JOIN pg_index i ON i.indexrelid = s.indexrelid
       WHERE s.idx_scan = 0
         AND NOT i.indisprimary
         AND NOT i.indisunique)                                           AS unused_indexes,

      (SELECT COUNT(*)
       FROM pg_stat_user_tables
       WHERE seq_scan > COALESCE(idx_scan, 0)
         AND n_live_tup > 10000)                                         AS tables_missing_indexes,

      (SELECT COUNT(*)
       FROM pg_index ix1
       JOIN pg_index ix2 ON ix1.indrelid = ix2.indrelid
                        AND ix1.indkey   = ix2.indkey
                        AND ix1.indexrelid < ix2.indexrelid)             AS duplicate_indexes,

      pg_size_pretty(
        SUM(pg_relation_size(indexrelid))
      )                                                                   AS total_index_size,

      pg_size_pretty(
        COALESCE((
          SELECT SUM(pg_relation_size(s.indexrelid))
          FROM pg_stat_user_indexes s
          JOIN pg_index i ON i.indexrelid = s.indexrelid
          WHERE s.idx_scan = 0
            AND NOT i.indisprimary
            AND NOT i.indisunique
        ), 0)
      )                                                                   AS wasted_index_size

    FROM pg_stat_user_indexes;
  `;

  const rows = await query<IndexHealthSummary>(sql);
  return rows[0];
}

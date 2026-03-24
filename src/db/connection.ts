import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

let pool: Pool | null = null;

export interface ConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  connectionString?: string;
}

export function createPool(config?: ConnectionConfig): Pool {
  if (pool) return pool;

  pool = new Pool(
    config?.connectionString
      ? { connectionString: config.connectionString }
      : {
          host: config?.host || process.env.PG_HOST || 'localhost',
          port: config?.port || Number(process.env.PG_PORT) || 5432,
          database: config?.database || process.env.PG_DATABASE,
          user: config?.user || process.env.PG_USER,
          password: config?.password || process.env.PG_PASSWORD,
          ssl: config?.ssl || process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
          max: 5,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
        }
  );

  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err.message);
  });

  return pool;
}

export async function getClient(): Promise<PoolClient> {
  const p = createPool();
  return p.connect();
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const p = createPool();
  const result = await p.query(sql, params);
  return result.rows as T[];
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const rows = await query<{ now: Date }>('SELECT NOW() as now');
    return rows.length > 0;
  } catch {
    return false;
  }
}

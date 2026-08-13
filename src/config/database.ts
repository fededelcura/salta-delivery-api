/**
 * Pool PostgreSQL — API compatible con el patrón mssql (.input / .query / recordset).
 */
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export type SqlType = { __sqlType: string };

function t(name: string): SqlType {
  return { __sqlType: name };
}

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<pg.QueryResult>;
};

type BoundParam = { type: string; value: unknown };

function isSqlType(x: unknown): x is SqlType {
  return !!x && typeof x === 'object' && '__sqlType' in x;
}

/** Tipo PG para que null/$n no fallen con "could not determine data type". */
function pgCast(sqlType: string): string {
  switch (sqlType) {
    case 'uuid':
      return 'uuid';
    case 'int':
    case 'tinyint':
    case 'smallint':
      return 'int';
    case 'bigint':
      return 'bigint';
    case 'float':
    case 'real':
      return 'float8';
    case 'decimal':
    case 'numeric':
      return 'numeric';
    case 'bit':
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'datetime':
    case 'timestamptz':
      return 'timestamptz';
    default:
      return 'text';
  }
}

function normalizeValue(sqlType: string, value: unknown): unknown {
  if (value === undefined) return null;
  if ((sqlType === 'bit' || sqlType === 'boolean') && (value === 0 || value === 1)) {
    return value === 1;
  }
  if ((sqlType === 'bit' || sqlType === 'boolean') && (value === '0' || value === '1')) {
    return value === '1';
  }
  return value;
}

/** Convierte @nombre → $1::tipo… (reusa el mismo índice si el nombre se repite). */
export function namedToPositional(
  text: string,
  params: Record<string, BoundParam>,
): { text: string; values: unknown[] } {
  const order: string[] = [];
  const values: unknown[] = [];
  const converted = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
    if (!(name in params)) {
      throw new Error(`Parámetro SQL no vinculado: @${name}`);
    }
    let idx = order.indexOf(name);
    if (idx === -1) {
      const p = params[name]!;
      order.push(name);
      values.push(normalizeValue(p.type, p.value));
      idx = order.length - 1;
    }
    const cast = pgCast(params[name]!.type);
    return `$${idx + 1}::${cast}`;
  });
  return { text: converted, values };
}

/**
 * Parte un batch en sentencias (no dentro de strings).
 * node-pg no permite múltiples comandos en prepared statements.
 */
export function splitStatements(sqlText: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i]!;
    if (ch === "'" && sqlText[i - 1] !== '\\') {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === ';' && !inSingle) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts.length ? parts : [sqlText];
}

export class DbPool {
  constructor(readonly pool: pg.Pool) {}

  get connected(): boolean {
    return !(this.pool as pg.Pool & { ended?: boolean }).ended;
  }

  request(): SqlRequest {
    return new SqlRequest(this.pool);
  }
}

export class SqlTransaction {
  client: pg.PoolClient | null = null;
  private readonly pgPool: pg.Pool;

  constructor(pool: pg.Pool | DbPool) {
    this.pgPool = pool instanceof DbPool ? pool.pool : pool;
  }

  async begin(): Promise<void> {
    this.client = await this.pgPool.connect();
    await this.client.query('BEGIN');
  }

  async commit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.query('COMMIT');
    } finally {
      this.client.release();
      this.client = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.query('ROLLBACK');
    } finally {
      this.client.release();
      this.client = null;
    }
  }
}

export class SqlRequest {
  private params: Record<string, BoundParam> = {};
  private readonly client: Queryable;

  constructor(target: Queryable | SqlTransaction | DbPool | pg.Pool) {
    if (target instanceof SqlTransaction) {
      if (!target.client) throw new Error('Transacción no iniciada (begin)');
      this.client = target.client;
    } else if (target instanceof DbPool) {
      this.client = target.pool;
    } else {
      this.client = target;
    }
  }

  input(name: string, type: SqlType | unknown, value: unknown): this {
    this.params[name] = {
      type: isSqlType(type) ? type.__sqlType : 'text',
      value,
    };
    return this;
  }

  async query<T = Record<string, unknown>>(
    text: string,
  ): Promise<{ recordset: T[]; rowsAffected: number[]; rowCount: number }> {
    const { text: sqlText, values } = namedToPositional(text, this.params);
    // node-pg: una sola sentencia por prepared statement (no batches con ;)
    try {
      const result = await this.client.query(sqlText, values);
      const rowCount = result.rowCount ?? 0;
      return {
        recordset: result.rows as T[],
        rowsAffected: [rowCount],
        rowCount,
      };
    } catch (err) {
      const e = err as Error & { code?: string; detail?: string; constraint?: string };
      if (e.code === '23505') {
        e.message = `${e.message} ${e.detail ?? ''} ${e.constraint ?? ''}`.trim();
        (e as { number?: number }).number = 23505;
      }
      throw e;
    }
  }
}

/** Stubs de tipos + Request/Transaction (compatibilidad mssql). */
export const sql = {
  MAX: Number.MAX_SAFE_INTEGER,
  NVarChar: (_len?: number | typeof Number.MAX_SAFE_INTEGER) => t('nvarchar'),
  VarChar: (_len?: number) => t('varchar'),
  Char: (_len?: number) => t('char'),
  Int: t('int'),
  SmallInt: t('smallint'),
  TinyInt: t('tinyint'),
  BigInt: t('bigint'),
  Float: t('float'),
  Real: t('real'),
  Decimal: (_p?: number, _s?: number) => t('decimal'),
  Numeric: (_p?: number, _s?: number) => t('numeric'),
  Bit: t('bit'),
  Boolean: t('boolean'),
  Date: t('date'),
  DateTime: t('datetime'),
  DateTimeOffset: t('timestamptz'),
  UniqueIdentifier: t('uuid'),
  Transaction: SqlTransaction,
  Request: SqlRequest,
};

let db: DbPool | null = null;

export function buildPoolConfig(): pg.PoolConfig {
  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    };
  }
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  };
}

export async function getPool(): Promise<DbPool> {
  if (db?.connected) return db;
  const pool = new Pool(buildPoolConfig());
  pool.on('error', (err) => {
    console.error('[db] pool error', err);
    db = null;
  });
  const client = await pool.connect();
  client.release();
  db = new DbPool(pool);
  return db;
}

export async function closePool(): Promise<void> {
  if (db) {
    await db.pool.end();
    db = null;
  }
}

import sql from 'mssql';
import { env } from './env.js';

/**
 * Pool SQL Server 2025 — instancia PROYECTOS.
 *
 * En Node (tedious) preferí SQL Auth (SQLSERVER_USER/PASSWORD).
 * Named instance: si SQL Browser está apagado, usá host + puerto (1433).
 */

let pool: sql.ConnectionPool | null = null;

export function buildConfig(): sql.config {
  const server = env.SQLSERVER_SERVER.includes('\\')
    ? env.SQLSERVER_SERVER.split('\\')[0]!
    : env.SQLSERVER_SERVER;

  const options: sql.IOptions = {
    encrypt: env.SQLSERVER_ENCRYPT,
    trustServerCertificate: env.SQLSERVER_TRUST_CERTIFICATE,
    enableArithAbort: true,
  };

  const config: sql.config = {
    server,
    port: env.SQLSERVER_PORT,
    database: env.SQLSERVER_DATABASE,
    options,
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
    pool: { max: 20, min: 0, idleTimeoutMillis: 30_000 },
  };

  if (env.SQLSERVER_USER) {
    config.user = env.SQLSERVER_USER;
    config.password = env.SQLSERVER_PASSWORD;
  } else {
    // tedious no hace Windows Auth real sin msnodesqlv8
    (config.options as sql.IOptions & { trustedConnection?: boolean }).trustedConnection =
      true;
  }

  return config;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;

  pool = await new sql.ConnectionPool(buildConfig()).connect();
  pool.on('error', (err) => {
    console.error('[db] pool error', err);
    pool = null;
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export { sql };

/**
 * Migraciones SQL versionadas: aplica api/migrations/NNN_*.sql pendientes, en orden,
 * una transacción por archivo. Se ejecuta al arrancar la API (local y Render).
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPool, closePool } from '../config/database.js';

/** Clave fija de pg_advisory_xact_lock: serializa instancias que arrancan a la vez. */
const LOCK_KEY = 482_615_907;

/** src/db y dist/db quedan a la misma profundidad respecto de api/migrations. */
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

function checksum(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  const db = await getPool();
  const pool = db.pool;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id          VARCHAR(200) NOT NULL CONSTRAINT pk_schema_migrations PRIMARY KEY,
      checksum    VARCHAR(64)  NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  let files: string[];
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    console.warn(`[migrate] sin carpeta ${MIGRATIONS_DIR}; nada que aplicar`);
    return { applied: [] };
  }

  const applied: string[] = [];
  for (const file of files) {
    const text = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const sum = checksum(text);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const prev = await client.query<{ checksum: string }>(
        'SELECT checksum FROM public.schema_migrations WHERE id = $1',
        [file],
      );
      if (prev.rows[0]) {
        await client.query('COMMIT');
        if (prev.rows[0].checksum !== sum) {
          console.warn(`[migrate] ${file} cambió después de aplicada; creá una migración nueva`);
        }
        continue;
      }
      await client.query(text);
      await client.query(
        'INSERT INTO public.schema_migrations (id, checksum) VALUES ($1, $2)',
        [file, sum],
      );
      await client.query('COMMIT');
      applied.push(file);
      console.info(`[migrate] aplicada ${file}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`[migrate] falló ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  if (applied.length === 0) console.info('[migrate] esquema al día');
  return { applied };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

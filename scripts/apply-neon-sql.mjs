/**
 * One-shot: apply schema + seed to Neon. Usage:
 *   set DATABASE_URL=... && node scripts/apply-neon-sql.mjs
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const files = [
  path.join(root, 'database/postgres/001_schema.sql'),
  path.join(root, 'database/postgres/002_seed_minimo.sql'),
];

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  const info = await client.query(
    'select current_database() as db, current_user as u',
  );
  console.log('connected', info.rows[0]);

  for (const file of files) {
    const sql = fs.readFileSync(file, 'utf8');
    console.log('applying', path.basename(file), `(${sql.length} chars)`);
    await client.query(sql);
    console.log('ok', path.basename(file));
  }

  const users = await client.query(
    `select email, rol from public.usuarios order by email`,
  );
  console.log(
    'usuarios',
    users.rows.map((r) => `${r.email}:${r.rol}`).join(', '),
  );
} catch (e) {
  console.error('FAILED', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

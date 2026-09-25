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

const sql = fs.readFileSync(
  path.join(root, 'database/postgres/017_email_verification.sql'),
  'utf8',
);

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query(sql);
  const col = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'usuarios' and column_name = 'email_verificado'`,
  );
  const tbl = await client.query(
    `select to_regclass('public.email_verification_codes') as tbl`,
  );
  console.log('ok', col.rows[0], tbl.rows[0]);
} catch (e) {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

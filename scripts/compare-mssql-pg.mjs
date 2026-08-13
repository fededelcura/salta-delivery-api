import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const psql = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const env = {
  ...process.env,
  PGPASSWORD: process.env.PGPASSWORD || '',
  PGUSER: process.env.PGUSER || 'postgres',
  PGHOST: process.env.PGHOST || 'localhost',
  PGPORT: process.env.PGPORT || '5432',
  PGDATABASE: 'salta_delivery',
};

function pgQuery(q) {
  return execFileSync(psql, ['-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', q], {
    env,
    encoding: 'utf8',
  }).replace(/\r/g, '').trim();
}

const mssql = await sql.connect({
  server: process.env.SQLSERVER_SERVER || 'localhost',
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DATABASE || 'salta_delivery',
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
});

const msTables = (
  await mssql.request().query(`
    SELECT t.name AS tabla
    FROM sys.tables t WHERE t.is_ms_shipped = 0 ORDER BY t.name
  `)
).recordset.map((r) => r.tabla);

const pgTables = pgQuery(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1
`).split('\n').filter(Boolean);

console.log('SQL Server tables:', msTables.length, '→', msTables.join(', '));
console.log('PostgreSQL tables:', pgTables.length, '→', pgTables.join(', '));
console.log('\nConteos:');

const all = [...new Set([...msTables, ...pgTables])].sort();
let diffs = 0;
for (const t of all) {
  let ms = '-';
  let pgC = '-';
  if (msTables.includes(t)) {
    const r = await mssql.request().query(`SELECT COUNT(*) AS c FROM dbo.[${t}]`);
    ms = String(r.recordset[0].c);
  }
  if (pgTables.includes(t)) {
    pgC = pgQuery(`SELECT COUNT(*)::text FROM public."${t}"`);
  }
  const ok = ms === pgC ? 'OK' : 'DIFF';
  if (ok === 'DIFF') diffs++;
  console.log(`${ok.padEnd(4)} ${t.padEnd(28)} MSSQL=${ms.padStart(4)}  PG=${pgC.padStart(4)}`);
}

console.log(`\nDiferencias: ${diffs}`);
await mssql.close();

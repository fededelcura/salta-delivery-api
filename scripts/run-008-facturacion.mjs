import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  server: process.env.SQLSERVER_SERVER || 'localhost',
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DATABASE || 'salta_delivery',
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  options: {
    encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
    trustServerCertificate: process.env.SQLSERVER_TRUST_CERTIFICATE !== 'false',
  },
};

const file = path.resolve(__dirname, '..', '..', 'database', '008_facturacion.sql');
const raw = fs.readFileSync(file, 'utf8');
const batches = raw
  .split(/^\s*GO\s*$/gim)
  .map((b) => b.trim())
  .filter(Boolean);

console.log('Connecting', config.server, config.database, 'batches', batches.length);
const pool = await sql.connect(config);
for (let i = 0; i < batches.length; i++) {
  try {
    await pool.request().query(batches[i]);
    console.log('OK batch', i + 1);
  } catch (e) {
    console.error('FAIL batch', i + 1, e instanceof Error ? e.message : e);
    process.exitCode = 1;
    await pool.close();
    process.exit(1);
  }
}

const check = await pool.request().query(`
  SELECT
    (SELECT COUNT(*) FROM sys.tables WHERE name = 'config_comisiones') AS config_comisiones,
    (SELECT COUNT(*) FROM sys.tables WHERE name = 'comprobantes') AS comprobantes,
    (SELECT COUNT(*) FROM sys.tables WHERE name = 'comprobante_seq') AS comprobante_seq,
    (SELECT COUNT(*) FROM dbo.config_comisiones) AS filas_comision
`);
console.log(check.recordset[0]);
await pool.close();
console.log('Migración 008 OK');

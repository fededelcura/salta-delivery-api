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

const file = path.resolve(__dirname, '..', '..', 'database', '016_tipo_cuenta_cliente.sql');
const raw = fs.readFileSync(file, 'utf8');
const batches = raw
  .split(/^\s*GO\s*$/gim)
  .map((b) => b.trim())
  .filter(Boolean);

const pool = await sql.connect(config);
for (let i = 0; i < batches.length; i++) {
  await pool.request().query(batches[i]);
  console.log('OK batch', i + 1);
}
const check = await pool.request().query(`
  SELECT COL_LENGTH('dbo.clientes','tipo_cuenta') AS tipo,
         COL_LENGTH('dbo.clientes','tiempo_preparacion_min') AS prep,
         COL_LENGTH('dbo.viajes','listo_para_retiro_en') AS listo
`);
console.log(check.recordset[0]);
await pool.close();
console.log('Migración 016 OK');

import { getPool, closePool, sql } from '../src/config/database.ts';

const pool = await getPool();
const count = await pool.request().query('SELECT COUNT(*)::int AS n FROM usuarios');
console.log('usuarios:', count.recordset[0]);

const admin = await pool
  .request()
  .input('e', sql.NVarChar(255), 'admin@saltadelivery.com')
  .query('SELECT email, rol, estado FROM usuarios WHERE email = @e');
console.log('admin:', admin.recordset[0]);

const cfg = await pool.request().query('SELECT COUNT(*)::int AS n FROM configuraciones');
console.log('configuraciones:', cfg.recordset[0]);

const zonas = await pool.request().query('SELECT COUNT(*)::int AS n FROM zonas_hexagonos');
console.log('zonas:', zonas.recordset[0]);

await closePool();
console.log('OK — PostgreSQL listo');

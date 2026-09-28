/**
 * Genera una contraseña nueva para el admin y la imprime una sola vez.
 *
 *   cd api && npx tsx scripts/reset-admin.ts [email]
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { getPool, sql } from '../src/config/database.js';

const EMAIL = process.argv[2] || 'admin@saltadelivery.com';
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generarClave(largo = 16): string {
  const bytes = randomBytes(largo);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

async function main() {
  const clave = generarClave();
  const hash = await bcrypt.hash(clave, 10);
  const pool = await getPool();
  const r = await pool
    .request()
    .input('email', sql.NVarChar(255), EMAIL)
    .input('hash', sql.NVarChar(255), hash)
    .query<{ id: string; rol: string }>(`
      UPDATE usuarios
      SET password_hash = @hash, estado = 'activo', email_verificado = TRUE, telefono_verificado = TRUE
      WHERE LOWER(email) = LOWER(@email) AND rol = 'administrador'
      RETURNING id, rol
    `);
  if (!r.recordset[0]) {
    throw new Error(`No existe un administrador con email ${EMAIL}`);
  }
  console.log(`Clave nueva de ${EMAIL}: ${clave}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

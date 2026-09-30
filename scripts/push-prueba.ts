/**
 * Manda un push de prueba a todos los dispositivos suscriptos de un usuario.
 * Sirve para probar en el teléfono con la app cerrada.
 *
 *   cd api && npx tsx scripts/push-prueba.ts [email]
 */
import { getPool, sql } from '../src/config/database.js';
import { pushService } from '../src/services/push.service.js';

const EMAIL = process.argv[2] || 'cadete.prueba@saltadelivery.test';

async function main() {
  if (!pushService.habilitado()) {
    throw new Error('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en api/.env');
  }
  const pool = await getPool();
  const u = await pool
    .request()
    .input('email', sql.NVarChar(255), EMAIL)
    .query<{ id: string; subs: number }>(`
      SELECT u.id, (SELECT COUNT(*)::int FROM push_suscripciones p WHERE p.usuario_id = u.id) AS subs
      FROM usuarios u WHERE LOWER(u.email) = LOWER(@email)
    `);
  const usuario = u.recordset[0];
  if (!usuario) throw new Error(`No existe el usuario ${EMAIL}`);
  if (!usuario.subs) {
    throw new Error(`${EMAIL} no tiene dispositivos suscriptos: entrá a Viajes y tocá "Activar avisos"`);
  }
  const r = await pushService.enviarAUsuario(usuario.id, {
    titulo: 'Prueba de avisos',
    cuerpo: 'Si ves esto con la app cerrada, los avisos de pedidos funcionan.',
    tag: 'prueba',
    url: '/#/cadete/viajes',
  });
  console.log(`${EMAIL}: ${usuario.subs} dispositivo(s) · enviados ${r.enviados} · borrados ${r.borrados}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

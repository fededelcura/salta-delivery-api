/**
 * Cuentas de prueba fijas (web y apps comparten la base):
 *   cliente.prueba / negocio.prueba / cadete.prueba @saltadelivery.test — contraseña Prueba2026!
 *
 *   cd api && npx tsx scripts/usuarios-prueba.ts
 *
 * Idempotente: si el email existe, resetea contraseña y lo deja activo/verificado.
 */
import bcrypt from 'bcryptjs';
import { getPool, sql } from '../src/config/database.js';
import { authModel } from '../src/models/auth.model.js';
import { clienteModel } from '../src/models/cliente.model.js';
import { cadeteModel } from '../src/models/cadete.model.js';
import { normalizarDireccionInput, resolverZonaPorBarrio } from '../src/services/direccion.service.js';
import { saveClienteDniFromDataUrl } from '../src/services/cadete-docs.service.js';

const PASSWORD = 'Prueba2026!';
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function usuarioPorEmail(email: string): Promise<{ id: string } | undefined> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query<{ id: string }>(`SELECT id FROM usuarios WHERE LOWER(email) = LOWER(@email)`);
  return r.recordset[0];
}

async function libre(query: string, valor: string): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.request().input('v', sql.NVarChar(50), valor).query(query);
  return r.recordset.length === 0;
}

async function telefonoLibre(base: number): Promise<string> {
  for (let n = base; ; n++) {
    if (await libre(`SELECT 1 FROM usuarios WHERE telefono = @v`, String(n))) return String(n);
  }
}

async function dniLibre(base: number): Promise<string> {
  for (let n = base; ; n++) {
    const v = String(n);
    if (
      (await libre(`SELECT 1 FROM clientes WHERE dni = @v`, v)) &&
      (await libre(`SELECT 1 FROM cadetes WHERE dni = @v`, v))
    ) {
      return v;
    }
  }
}

async function activar(id: string, resetPassword: boolean): Promise<void> {
  const pool = await getPool();
  const req = pool.request().input('id', sql.UniqueIdentifier, id);
  let setPass = '';
  if (resetPassword) {
    req.input('hash', sql.NVarChar(255), await bcrypt.hash(PASSWORD, 10));
    setPass = ', password_hash = @hash';
  }
  await req.query(`
    UPDATE usuarios
    SET estado = 'activo', email_verificado = TRUE, telefono_verificado = TRUE${setPass}
    WHERE id = @id
  `);
}

async function direccion(calle: string, numero: string) {
  const parts = normalizarDireccionInput({ calle, numero, barrio: 'Centro' });
  const zona = await resolverZonaPorBarrio(parts.barrio);
  return { parts, zona };
}

async function asegurarCliente(opts: {
  email: string;
  nombre: string;
  tipo: 'particular' | 'restaurante';
  calle: string;
  numero: string;
  telBase: number;
  dniBase: number;
}): Promise<void> {
  const existente = await usuarioPorEmail(opts.email);
  let id = existente?.id;
  if (!id) {
    const user = await authModel.register({
      email: opts.email,
      telefono: await telefonoLibre(opts.telBase),
      nombre: opts.nombre,
      password: PASSWORD,
      rol: 'cliente',
      dni: await dniLibre(opts.dniBase),
    });
    id = user.id;
    const { parts, zona } = await direccion(opts.calle, opts.numero);
    const saved = saveClienteDniFromDataUrl(id, PNG_1PX);
    await clienteModel.setIdentidad(id, {
      direccion: parts.direccion,
      calle: parts.calle,
      numero: parts.numero,
      piso_dpto: parts.piso_dpto,
      barrio: parts.barrio,
      ciudad: parts.ciudad,
      provincia: parts.provincia,
      zona_h3: zona?.h3_index ?? null,
      zona_nombre: zona?.nombre ?? null,
      zona_lat: zona?.lat_centro ?? null,
      zona_lng: zona?.lng_centro ?? null,
      dni_pdf: saved.relativeUrl,
    });
  }
  await activar(id, Boolean(existente));
  await clienteModel.setTipoCuenta(id, {
    tipo_cuenta: opts.tipo,
    tiempo_preparacion_min: opts.tipo === 'restaurante' ? 20 : 0,
    horario_comercial: opts.tipo === 'restaurante' ? { abre: '09:00', cierra: '23:59' } : null,
    umbral_envio_negocio: opts.tipo === 'restaurante' ? 15000 : null,
  });
  console.log(`  ${existente ? 'actualizado' : 'creado'}: ${opts.email}`);
}

async function asegurarCadete(email: string): Promise<void> {
  const existente = await usuarioPorEmail(email);
  let id = existente?.id;
  if (!id) {
    const { parts, zona } = await direccion('Caseros', '700');
    const cadete = await cadeteModel.registrar({
      email,
      telefono: await telefonoLibre(3875100003),
      nombre: 'Cadete Prueba',
      password: PASSWORD,
      dni: await dniLibre(40100003),
      licencia: 'LIC-PRUEBA',
      fecha_nacimiento: '1996-03-15',
      patente: 'PRB123',
      marca_moto: 'Honda Wave',
      direccion: parts.direccion,
      calle: parts.calle,
      numero: parts.numero,
      piso_dpto: parts.piso_dpto,
      barrio: parts.barrio,
      ciudad: parts.ciudad,
      provincia: parts.provincia,
      zona_h3: zona?.h3_index ?? null,
      datos_moto: { marca: 'Honda Wave', patente: 'PRB123' },
      fotos_documentos: {},
    });
    id = cadete.usuario_id;
  }
  await cadeteModel.setVerificacion(id, 'aprobado');
  await activar(id, Boolean(existente));
  console.log(`  ${existente ? 'actualizado' : 'creado'}: ${email}`);
}

async function main() {
  await asegurarCliente({
    email: 'cliente.prueba@saltadelivery.test',
    nombre: 'Cliente Prueba',
    tipo: 'particular',
    calle: 'Mitre',
    numero: '300',
    telBase: 3875100001,
    dniBase: 40100001,
  });
  await asegurarCliente({
    email: 'negocio.prueba@saltadelivery.test',
    nombre: 'Pizzería Prueba',
    tipo: 'restaurante',
    calle: 'Balcarce',
    numero: '800',
    telBase: 3875100002,
    dniBase: 40100002,
  });
  await asegurarCadete('cadete.prueba@saltadelivery.test');
  console.log(`Listo. Contraseña de las 3 cuentas: ${PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

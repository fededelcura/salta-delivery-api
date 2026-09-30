/**
 * Prueba de despacho por anillos con cadete.prueba:
 *   cd api && npx tsx scripts/prueba-anillos.ts
 *
 * Ubica al cadete en un punto fuera de la ciudad (ningún cadete real lo ve), crea 3 pedidos a
 * 2 / 8 / 15 km, simula antigüedades y verifica qué ve. Al final cancela los pedidos y restaura
 * la ubicación del cadete.
 */
import { getPool, sql } from '../src/config/database.js';
import { viajeModel } from '../src/models/viaje.model.js';
import { despachoService } from '../src/services/despacho.service.js';

const BASE = { lat: -24.42, lng: -65.83 };
const DISTANCIAS_KM = [2, 8, 15];

async function idPorEmail(email: string): Promise<string> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query<{ id: string }>(`SELECT id FROM usuarios WHERE LOWER(email) = LOWER(@email)`);
  if (!r.recordset[0]) throw new Error(`Falta ${email}: correr scripts/usuarios-prueba.ts`);
  return r.recordset[0].id;
}

async function setUbicacion(cadeteId: string, lat: number | null, lng: number | null, at: Date | null) {
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, cadeteId)
    .input('lat', sql.Float, lat)
    .input('lng', sql.Float, lng)
    .input('at', sql.DateTimeOffset, at)
    .query(`
      UPDATE cadetes SET ubicacion_lat = @lat, ubicacion_lng = @lng, ubicacion_actualizada_en = @at
      WHERE usuario_id = @id
    `);
}

async function crearViaje(clienteId: string, km: number): Promise<string> {
  const origen = { lat: BASE.lat + km / 111.2, lng: BASE.lng };
  const pool = await getPool();
  const r = await pool
    .request()
    .input('cliente', sql.UniqueIdentifier, clienteId)
    .input('odir', sql.NVarChar(500), `PRUEBA ANILLOS ${km} km`)
    .input('olat', sql.Float, origen.lat)
    .input('olng', sql.Float, origen.lng)
    .input('dlat', sql.Float, origen.lat + 0.01)
    .input('dlng', sql.Float, origen.lng)
    .query<{ id: string }>(`
      INSERT INTO viajes (
        cliente_id, tipo_servicio,
        origen_direccion, origen_lat, origen_lng,
        destino_direccion, destino_lat, destino_lng,
        distancia_km, tiempo_estimado_min,
        tarifa_estimada, tarifa_final, comision_plataforma, pago_cadete,
        detalle_tarifa, estado, metodo_pago, estado_pago
      )
      VALUES (
        @cliente, 'mensajeria',
        @odir, @olat, @olng,
        'PRUEBA ANILLOS destino', @dlat, @dlng,
        1, 5,
        1000, 1000, 150, 850,
        '{}'::jsonb, 'buscando_cadete', 'efectivo', 'pendiente'
      )
      RETURNING id
    `);
  return r.recordset[0].id;
}

async function setEdad(ids: string[], segundos: number) {
  const pool = await getPool();
  for (const id of ids) {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('seg', sql.Int, segundos)
      .query(`UPDATE viajes SET fecha_solicitud = NOW() - (@seg * INTERVAL '1 second') WHERE id = @id`);
  }
}

async function visibles(cadeteId: string, ids: string[]): Promise<number[]> {
  const lista = await viajeModel.viajesDisponiblesParaCadete(cadeteId);
  return lista
    .filter((v) => ids.includes(v.id))
    .map((v) => Math.round(v.distancia_al_origen_km ?? -1))
    .sort((a, b) => a - b);
}

async function main() {
  const cadeteId = await idPorEmail('cadete.prueba@saltadelivery.test');
  const clienteId = await idPorEmail('cliente.prueba@saltadelivery.test');
  const pool = await getPool();
  const previa = (
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, cadeteId)
      .query<{ lat: number | null; lng: number | null; at: Date | null; disp: string }>(`
        SELECT ubicacion_lat AS lat, ubicacion_lng AS lng, ubicacion_actualizada_en AS at,
               disponibilidad AS disp
        FROM cadetes WHERE usuario_id = @id
      `)
  ).recordset[0];

  console.log('Anillos:', JSON.stringify(await despachoService.getConfig()));
  const ids: string[] = [];
  let fallas = 0;
  try {
    await setUbicacion(cadeteId, BASE.lat, BASE.lng, new Date());
    for (const km of DISTANCIAS_KM) ids.push(await crearViaje(clienteId, km));

    const casos: { seg: number; esperado: number[] }[] = [
      { seg: 30, esperado: [2] },
      { seg: 90, esperado: [2] },
      { seg: 180, esperado: [2, 8] },
      { seg: 600, esperado: [2, 8] },
    ];
    for (const c of casos) {
      await setEdad(ids, c.seg);
      const got = await visibles(cadeteId, ids);
      const okCaso = JSON.stringify(got) === JSON.stringify(c.esperado);
      if (!okCaso) fallas += 1;
      console.log(`${okCaso ? 'OK ' : 'FALLA'} pedido de ${c.seg}s → ve ${JSON.stringify(got)} km (esperado ${JSON.stringify(c.esperado)})`);
    }

    // Avisos por socket: el cadete (online) recibe cada pedido una sola vez, al entrar en su anillo.
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, cadeteId)
      .query(`UPDATE cadetes SET disponibilidad = 'online' WHERE usuario_id = @id`);
    const viajes = await Promise.all(ids.map((id) => viajeModel.getById(id)));
    const avisosCasos: { seg: number; esperado: number[] }[] = [
      { seg: 30, esperado: [2] },
      { seg: 90, esperado: [] },
      { seg: 180, esperado: [8] },
      { seg: 600, esperado: [] },
    ];
    for (const c of avisosCasos) {
      const got: number[] = [];
      for (const [i, v] of viajes.entries()) {
        await despachoService.notificarAnillo(
          v,
          (cid) => {
            if (cid === cadeteId) got.push(DISTANCIAS_KM[i]);
          },
          new Date(v.fecha_solicitud).getTime() + c.seg * 1000,
        );
      }
      const okCaso = JSON.stringify(got) === JSON.stringify(c.esperado);
      if (!okCaso) fallas += 1;
      console.log(`${okCaso ? 'OK ' : 'FALLA'} aviso a los ${c.seg}s → ${JSON.stringify(got)} km (esperado ${JSON.stringify(c.esperado)})`);
    }

    await setUbicacion(cadeteId, null, null, null);
    const sinGps = await visibles(cadeteId, ids);
    if (sinGps.length) fallas += 1;
    console.log(`${sinGps.length ? 'FALLA' : 'OK '} sin GPS → ve ${JSON.stringify(sinGps)}`);
  } finally {
    for (const id of ids) {
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .query(`UPDATE viajes SET estado = 'cancelado' WHERE id = @id`);
    }
    await setUbicacion(cadeteId, previa?.lat ?? null, previa?.lng ?? null, previa?.at ?? null);
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, cadeteId)
      .input('d', sql.NVarChar(20), previa?.disp ?? 'offline')
      .query(`UPDATE cadetes SET disponibilidad = @d WHERE usuario_id = @id`);
    console.log(`Limpieza: ${ids.length} pedidos de prueba cancelados, ubicación y disponibilidad restauradas.`);
  }
  if (fallas) throw new Error(`${fallas} caso(s) fallaron`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

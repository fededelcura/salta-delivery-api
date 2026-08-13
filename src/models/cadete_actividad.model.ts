/**
 * Sesiones de trabajo cadete + estadísticas (horario, zona, viajes).
 */

import { getPool, sql } from '../config/database.js';
import type { DisponibilidadCadete } from '../types/domain.js';

export type ZonaCercana = {
  h3_index: string;
  nombre: string | null;
  dist_m: number;
};

const HAVERSINE_ZONA = `
  (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
    cos(radians(lat_centro)) * cos(radians(@lat)) * cos(radians(@lng) - radians(lng_centro))
    + sin(radians(lat_centro)) * sin(radians(@lat))
  ))))
`;

export async function resolverZonaCercana(
  lat: number,
  lng: number,
  maxMetros = 8000,
): Promise<ZonaCercana | null> {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .input('lat', sql.Float, lat)
      .input('lng', sql.Float, lng)
      .query<{ h3_index: string; nombre: string | null; dist_m: number }>(`
        SELECT h3_index, nombre,
               ${HAVERSINE_ZONA} AS dist_m
        FROM zonas_hexagonos
        WHERE activa = TRUE
        ORDER BY ${HAVERSINE_ZONA}
        LIMIT 1
      `);
    const z = r.recordset[0];
    if (!z || Number(z.dist_m) > maxMetros) return null;
    return { h3_index: z.h3_index, nombre: z.nombre, dist_m: Number(z.dist_m) };
  } catch {
    return null;
  }
}

async function cerrarAbiertas(cadeteId: string) {
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, cadeteId)
    .query(`
      UPDATE cadete_sesiones
      SET hasta = NOW()
      WHERE cadete_id = @id AND hasta IS NULL
    `);
}

async function abrirSesion(params: {
  cadeteId: string;
  disponibilidad: DisponibilidadCadete;
  zona_h3?: string | null;
  zona_nombre?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  if (params.disponibilidad === 'offline') return;
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, params.cadeteId)
    .input('d', sql.NVarChar(20), params.disponibilidad)
    .input('zona', sql.NVarChar(64), params.zona_h3 ?? null)
    .input('znombre', sql.NVarChar(100), params.zona_nombre ?? null)
    .input('lat', sql.Float, params.lat ?? null)
    .input('lng', sql.Float, params.lng ?? null)
    .query(`
      INSERT INTO cadete_sesiones
        (cadete_id, disponibilidad, zona_h3, zona_nombre, lat, lng)
      VALUES (@id, @d, @zona, @znombre, @lat, @lng)
    `);
}

export class CadeteActividadModel {
  /** Cierra sesión abierta y abre una nueva si no es offline. */
  async registrarCambioDisponibilidad(
    cadeteId: string,
    disponibilidad: DisponibilidadCadete,
    meta?: { lat?: number | null; lng?: number | null; zona_h3?: string | null; zona_nombre?: string | null },
  ) {
    try {
      await cerrarAbiertas(cadeteId);
      let zona_h3 = meta?.zona_h3 ?? null;
      let zona_nombre = meta?.zona_nombre ?? null;
      if (!zona_h3 && meta?.lat != null && meta?.lng != null) {
        const z = await resolverZonaCercana(meta.lat, meta.lng);
        zona_h3 = z?.h3_index ?? null;
        zona_nombre = z?.nombre ?? null;
      }
      if (!zona_h3) {
        const pool = await getPool();
        const cur = await pool
          .request()
          .input('id', sql.UniqueIdentifier, cadeteId)
          .query<{ zona_actual: string | null; lat: number | null; lng: number | null }>(`
            SELECT zona_actual, ubicacion_lat AS lat, ubicacion_lng AS lng
            FROM cadetes WHERE usuario_id = @id
          `);
        const row = cur.recordset[0];
        zona_h3 = row?.zona_actual ?? null;
        if (!meta?.lat && row?.lat != null) {
          meta = { ...meta, lat: row.lat, lng: row.lng };
        }
        if (zona_h3 && !zona_nombre) {
          const zn = await pool
            .request()
            .input('h3', sql.NVarChar(64), zona_h3)
            .query<{ nombre: string | null }>(
              `SELECT nombre FROM zonas_hexagonos WHERE h3_index = @h3`,
            );
          zona_nombre = zn.recordset[0]?.nombre ?? null;
        }
      }
      await abrirSesion({
        cadeteId,
        disponibilidad,
        zona_h3,
        zona_nombre,
        lat: meta?.lat,
        lng: meta?.lng,
      });
    } catch (err) {
      console.error('[cadete_actividad] registrarCambio', err);
    }
  }

  /** Actualiza zona en sesión abierta; parte sesión si cambió de zona. */
  async actualizarZonaEnSesion(
    cadeteId: string,
    lat: number,
    lng: number,
  ): Promise<{ zona_h3: string | null; zona_nombre: string | null }> {
    const z = await resolverZonaCercana(lat, lng);
    const zona_h3 = z?.h3_index ?? null;
    const zona_nombre = z?.nombre ?? null;

    try {
      const pool = await getPool();
      const open = await pool
        .request()
        .input('id', sql.UniqueIdentifier, cadeteId)
        .query<{ id: string; disponibilidad: string; zona_h3: string | null }>(`
          SELECT id, disponibilidad, zona_h3
          FROM cadete_sesiones
          WHERE cadete_id = @id AND hasta IS NULL
          ORDER BY desde DESC
          LIMIT 1
        `);
      const s = open.recordset[0];
      if (!s) {
        const disp = await pool
          .request()
          .input('id', sql.UniqueIdentifier, cadeteId)
          .query<{ disponibilidad: string }>(
            `SELECT disponibilidad FROM cadetes WHERE usuario_id = @id`,
          );
        const d = disp.recordset[0]?.disponibilidad as DisponibilidadCadete | undefined;
        if (d && d !== 'offline') {
          await abrirSesion({
            cadeteId,
            disponibilidad: d,
            zona_h3,
            zona_nombre,
            lat,
            lng,
          });
        }
      } else if ((s.zona_h3 ?? null) !== (zona_h3 ?? null)) {
        await pool
          .request()
          .input('sid', sql.UniqueIdentifier, s.id)
          .query(`UPDATE cadete_sesiones SET hasta = NOW() WHERE id = @sid`);
        await abrirSesion({
          cadeteId,
          disponibilidad: s.disponibilidad as DisponibilidadCadete,
          zona_h3,
          zona_nombre,
          lat,
          lng,
        });
      } else if (s && zona_h3) {
        await pool
          .request()
          .input('sid', sql.UniqueIdentifier, s.id)
          .input('zona', sql.NVarChar(64), zona_h3)
          .input('znombre', sql.NVarChar(100), zona_nombre)
          .input('lat', sql.Float, lat)
          .input('lng', sql.Float, lng)
          .query(`
            UPDATE cadete_sesiones
            SET zona_h3 = @zona, zona_nombre = @znombre, lat = @lat, lng = @lng
            WHERE id = @sid
          `);
      }
    } catch (err) {
      console.error('[cadete_actividad] actualizarZona', err);
    }

    return { zona_h3, zona_nombre };
  }

  async estadisticas(params: {
    desde: string;
    hasta: string;
    cadete_id?: string;
  }) {
    const pool = await getPool();
    const desde = params.desde;
    const hasta = params.hasta;
    const cadeteId = params.cadete_id ?? null;

    const trabajando = await pool.request().query<{
      usuario_id: string;
      nombre: string;
      disponibilidad: string;
      zona_actual: string | null;
      zona_nombre: string | null;
      lat: number | null;
      lng: number | null;
      ubicacion_actualizada_en: Date | null;
      desde_sesion: Date | null;
      plan_suscripcion: string;
      total_viajes: number;
    }>(`
      SELECT c.usuario_id, u.nombre, c.disponibilidad, c.zona_actual,
             z.nombre AS zona_nombre,
             c.ubicacion_lat AS lat, c.ubicacion_lng AS lng,
             c.ubicacion_actualizada_en,
             s.desde AS desde_sesion,
             c.plan_suscripcion, c.total_viajes
      FROM cadetes c
      INNER JOIN usuarios u ON u.id = c.usuario_id
      LEFT JOIN zonas_hexagonos z ON z.h3_index = c.zona_actual
      LEFT JOIN cadete_sesiones s ON s.cadete_id = c.usuario_id AND s.hasta IS NULL
      WHERE c.disponibilidad IN ('online', 'en_viaje', 'ocupado')
        AND c.estado_verificacion = 'aprobado'
      ORDER BY c.disponibilidad, u.nombre
    `);

    const porCadete = await pool
      .request()
      .input('desde', sql.DateTimeOffset, desde)
      .input('hasta', sql.DateTimeOffset, hasta)
      .input('cadete', sql.UniqueIdentifier, cadeteId)
      .query<{
        cadete_id: string;
        nombre: string;
        minutos_online: number;
        minutos_en_viaje: number;
        minutos_ocupado: number;
        viajes_finalizados: number;
        km_totales: number;
        ganado: number;
        zonas_distintas: number;
      }>(`
        WITH sesiones AS (
          SELECT s.cadete_id, s.disponibilidad, s.zona_h3, s.zona_nombre,
                 CASE WHEN s.desde < @desde THEN @desde ELSE s.desde END AS d0,
                 CASE WHEN COALESCE(s.hasta, NOW()) > @hasta
                      THEN @hasta
                      ELSE COALESCE(s.hasta, NOW()) END AS d1
          FROM cadete_sesiones s
          WHERE s.desde < @hasta
            AND COALESCE(s.hasta, NOW()) > @desde
            AND (@cadete IS NULL OR s.cadete_id = @cadete)
        ),
        horas AS (
          SELECT cadete_id,
            SUM(CASE WHEN disponibilidad = 'online'
                     THEN EXTRACT(EPOCH FROM (d1 - d0)) / 60 ELSE 0 END) AS minutos_online,
            SUM(CASE WHEN disponibilidad = 'en_viaje'
                     THEN EXTRACT(EPOCH FROM (d1 - d0)) / 60 ELSE 0 END) AS minutos_en_viaje,
            SUM(CASE WHEN disponibilidad = 'ocupado'
                     THEN EXTRACT(EPOCH FROM (d1 - d0)) / 60 ELSE 0 END) AS minutos_ocupado,
            COUNT(DISTINCT zona_h3) AS zonas_distintas
          FROM sesiones
          WHERE d1 > d0
          GROUP BY cadete_id
        ),
        viajes AS (
          SELECT v.cadete_id,
                 COUNT(*) AS viajes_finalizados,
                 SUM(COALESCE(v.distancia_km, 0)) AS km_totales,
                 SUM(COALESCE(v.pago_cadete, 0)) AS ganado
          FROM viajes v
          WHERE v.estado = 'finalizado'
            AND v.cadete_id IS NOT NULL
            AND COALESCE(v.fecha_fin, v.fecha_solicitud) >= @desde
            AND COALESCE(v.fecha_fin, v.fecha_solicitud) < @hasta
            AND (@cadete IS NULL OR v.cadete_id = @cadete)
          GROUP BY v.cadete_id
        )
        SELECT COALESCE(h.cadete_id, vj.cadete_id) AS cadete_id,
               u.nombre,
               COALESCE(h.minutos_online, 0) AS minutos_online,
               COALESCE(h.minutos_en_viaje, 0) AS minutos_en_viaje,
               COALESCE(h.minutos_ocupado, 0) AS minutos_ocupado,
               COALESCE(vj.viajes_finalizados, 0) AS viajes_finalizados,
               COALESCE(vj.km_totales, 0) AS km_totales,
               COALESCE(vj.ganado, 0) AS ganado,
               COALESCE(h.zonas_distintas, 0) AS zonas_distintas
        FROM horas h
        FULL OUTER JOIN viajes vj ON vj.cadete_id = h.cadete_id
        INNER JOIN usuarios u ON u.id = COALESCE(h.cadete_id, vj.cadete_id)
        ORDER BY COALESCE(h.minutos_online, 0) + COALESCE(h.minutos_en_viaje, 0) DESC
      `);

    const porZona = await pool
      .request()
      .input('desde', sql.DateTimeOffset, desde)
      .input('hasta', sql.DateTimeOffset, hasta)
      .input('cadete', sql.UniqueIdentifier, cadeteId)
      .query<{
        zona_h3: string | null;
        zona_nombre: string | null;
        minutos: number;
        cadetes_unicos: number;
      }>(`
        SELECT s.zona_h3,
               MAX(COALESCE(s.zona_nombre, z.nombre, 'Sin zona')) AS zona_nombre,
               SUM(EXTRACT(EPOCH FROM (
                 (CASE WHEN COALESCE(s.hasta, NOW()) > @hasta THEN @hasta ELSE COALESCE(s.hasta, NOW()) END)
                 - (CASE WHEN s.desde < @desde THEN @desde ELSE s.desde END)
               )) / 60) AS minutos,
               COUNT(DISTINCT s.cadete_id) AS cadetes_unicos
        FROM cadete_sesiones s
        LEFT JOIN zonas_hexagonos z ON z.h3_index = s.zona_h3
        WHERE s.desde < @hasta
          AND COALESCE(s.hasta, NOW()) > @desde
          AND s.disponibilidad IN ('online', 'en_viaje', 'ocupado')
          AND (@cadete IS NULL OR s.cadete_id = @cadete)
        GROUP BY s.zona_h3
        HAVING SUM(EXTRACT(EPOCH FROM (
                 (CASE WHEN COALESCE(s.hasta, NOW()) > @hasta THEN @hasta ELSE COALESCE(s.hasta, NOW()) END)
                 - (CASE WHEN s.desde < @desde THEN @desde ELSE s.desde END)
               )) / 60) > 0
        ORDER BY minutos DESC
      `);

    const porHora = await pool
      .request()
      .input('desde', sql.DateTimeOffset, desde)
      .input('hasta', sql.DateTimeOffset, hasta)
      .input('cadete', sql.UniqueIdentifier, cadeteId)
      .query<{ hora: number; minutos_cubiertos: number; viajes: number }>(`
        WITH horas AS (
          SELECT generate_series(0, 23) AS hora
        ),
        ses AS (
          SELECT s.cadete_id, s.disponibilidad,
                 CASE WHEN s.desde < @desde THEN @desde ELSE s.desde END AS d0,
                 CASE WHEN COALESCE(s.hasta, NOW()) > @hasta
                      THEN @hasta
                      ELSE COALESCE(s.hasta, NOW()) END AS d1
          FROM cadete_sesiones s
          WHERE s.desde < @hasta
            AND COALESCE(s.hasta, NOW()) > @desde
            AND s.disponibilidad IN ('online', 'en_viaje', 'ocupado')
            AND (@cadete IS NULL OR s.cadete_id = @cadete)
        ),
        cov AS (
          SELECT h.hora,
                 SUM(
                   CASE
                     WHEN EXTRACT(HOUR FROM timezone('America/Argentina/Salta', d0)) <= h.hora
                      AND EXTRACT(HOUR FROM timezone('America/Argentina/Salta', d1)) >= h.hora
                      AND d1 > d0
                     THEN 1 ELSE 0
                   END
                 ) AS minutos_cubiertos
          FROM horas h
          CROSS JOIN ses
          GROUP BY h.hora
        ),
        vj AS (
          SELECT EXTRACT(HOUR FROM timezone('America/Argentina/Salta',
                   COALESCE(v.fecha_fin, v.fecha_solicitud)))::int AS hora,
                 COUNT(*) AS viajes
          FROM viajes v
          WHERE v.estado = 'finalizado'
            AND v.cadete_id IS NOT NULL
            AND COALESCE(v.fecha_fin, v.fecha_solicitud) >= @desde
            AND COALESCE(v.fecha_fin, v.fecha_solicitud) < @hasta
            AND (@cadete IS NULL OR v.cadete_id = @cadete)
          GROUP BY EXTRACT(HOUR FROM timezone('America/Argentina/Salta',
                   COALESCE(v.fecha_fin, v.fecha_solicitud)))
        )
        SELECT h.hora,
               COALESCE(c.minutos_cubiertos, 0) AS minutos_cubiertos,
               COALESCE(vj.viajes, 0) AS viajes
        FROM horas h
        LEFT JOIN cov c ON c.hora = h.hora
        LEFT JOIN vj ON vj.hora = h.hora
        ORDER BY h.hora
      `);

    const resumen = {
      trabajando_ahora: trabajando.recordset.length,
      minutos_online: porCadete.recordset.reduce((a, r) => a + Number(r.minutos_online), 0),
      minutos_en_viaje: porCadete.recordset.reduce((a, r) => a + Number(r.minutos_en_viaje), 0),
      viajes_finalizados: porCadete.recordset.reduce(
        (a, r) => a + Number(r.viajes_finalizados),
        0,
      ),
      ganado_total: porCadete.recordset.reduce((a, r) => a + Number(r.ganado), 0),
    };

    return {
      desde,
      hasta,
      resumen,
      trabajando_ahora: trabajando.recordset.map((r) => ({
        usuario_id: String(r.usuario_id),
        nombre: r.nombre,
        disponibilidad: r.disponibilidad,
        zona_h3: r.zona_actual,
        zona_nombre: r.zona_nombre,
        ubicacion:
          r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
        ubicacion_actualizada_en: r.ubicacion_actualizada_en
          ? new Date(r.ubicacion_actualizada_en).toISOString()
          : null,
        desde_sesion: r.desde_sesion ? new Date(r.desde_sesion).toISOString() : null,
        plan_suscripcion: r.plan_suscripcion,
        total_viajes: Number(r.total_viajes),
      })),
      por_cadete: porCadete.recordset.map((r) => ({
        cadete_id: String(r.cadete_id),
        nombre: r.nombre,
        horas_online: Math.round((Number(r.minutos_online) / 60) * 10) / 10,
        horas_en_viaje: Math.round((Number(r.minutos_en_viaje) / 60) * 10) / 10,
        horas_ocupado: Math.round((Number(r.minutos_ocupado) / 60) * 10) / 10,
        viajes_finalizados: Number(r.viajes_finalizados),
        km_totales: Math.round(Number(r.km_totales) * 10) / 10,
        ganado: Math.round(Number(r.ganado) * 100) / 100,
        zonas_distintas: Number(r.zonas_distintas),
      })),
      por_zona: porZona.recordset.map((r) => ({
        zona_h3: r.zona_h3,
        zona_nombre: r.zona_nombre ?? 'Sin zona',
        horas: Math.round((Number(r.minutos) / 60) * 10) / 10,
        cadetes_unicos: Number(r.cadetes_unicos),
      })),
      por_hora: porHora.recordset.map((r) => ({
        hora: Number(r.hora),
        sesiones_activas: Number(r.minutos_cubiertos),
        viajes: Number(r.viajes),
      })),
    };
  }
}

export const cadeteActividadModel = new CadeteActividadModel();

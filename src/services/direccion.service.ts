/**
 * Dirección estructurada + armado de texto + zona por barrio.
 */

import { getPool, sql } from '../config/database.js';

export type DireccionEstructurada = {
  calle: string;
  numero: string;
  piso_dpto?: string | null;
  barrio: string;
  ciudad?: string;
  provincia?: string;
};

export type ZonaResuelta = {
  h3_index: string;
  nombre: string;
  lat_centro: number;
  lng_centro: number;
};

/** Arma "Calle 123, Piso 2, Barrio, Ciudad, Provincia" */
export function armarDireccion(d: DireccionEstructurada): string {
  const calle = (d.calle ?? '').trim();
  const numero = (d.numero ?? '').trim();
  const piso = (d.piso_dpto ?? '').trim();
  const barrio = (d.barrio ?? '').trim();
  const ciudad = (d.ciudad ?? 'Salta').trim() || 'Salta';
  const provincia = (d.provincia ?? 'Salta').trim() || 'Salta';

  const linea1 = [calle, numero].filter(Boolean).join(' ');
  const parts = [linea1, piso || null, barrio || null, ciudad, provincia].filter(
    (p): p is string => Boolean(p && p.length),
  );
  return parts.join(', ');
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alias barrio → nombre de zona seed */
const BARRIO_ALIASES: Record<string, string> = {
  centro: 'Centro Cívico',
  'centro civico': 'Centro Cívico',
  'centro cívico': 'Centro Cívico',
  shopping: 'Shopping',
  'tres cerritos': 'Tres Cerritos',
  'grand bourg': 'Grand Bourg',
  'limite sur': 'Límite Sur',
  'límite sur': 'Límite Sur',
  aeropuerto: 'Aeropuerto Martín Miguel de Güemes',
  'martin miguel': 'Aeropuerto Martín Miguel de Güemes',
};

export async function resolverZonaPorBarrio(barrio: string): Promise<ZonaResuelta | null> {
  const b = normalize(barrio);
  if (!b) return null;

  try {
    const pool = await getPool();
    const zonas = await pool.request().query<{
      h3_index: string;
      nombre: string | null;
      lat_centro: number;
      lng_centro: number;
    }>(`
      SELECT h3_index, nombre, lat_centro, lng_centro
      FROM dbo.zonas_hexagonos
      WHERE activa = 1
    `);

    const aliasTarget = BARRIO_ALIASES[b];
    let best: (typeof zonas.recordset)[0] | null = null;

    for (const z of zonas.recordset) {
      const nombre = normalize(z.nombre ?? '');
      if (!nombre) continue;
      if (aliasTarget && nombre === normalize(aliasTarget)) {
        best = z;
        break;
      }
      if (nombre === b || nombre.includes(b) || b.includes(nombre)) {
        best = z;
        break;
      }
    }

    if (!best) return null;
    return {
      h3_index: best.h3_index,
      nombre: best.nombre ?? best.h3_index,
      lat_centro: Number(best.lat_centro),
      lng_centro: Number(best.lng_centro),
    };
  } catch (err) {
    console.error('[direccion] zona por barrio', err);
    return null;
  }
}

export function normalizarDireccionInput(input: DireccionEstructurada): DireccionEstructurada & {
  direccion: string;
} {
  const calle = input.calle.trim();
  const numero = input.numero.trim();
  const piso_dpto = (input.piso_dpto ?? '').trim() || null;
  const barrio = input.barrio.trim();
  const ciudad = (input.ciudad ?? 'Salta').trim() || 'Salta';
  const provincia = (input.provincia ?? 'Salta').trim() || 'Salta';
  const parts = { calle, numero, piso_dpto, barrio, ciudad, provincia };
  return { ...parts, direccion: armarDireccion(parts) };
}

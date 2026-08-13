/**
 * Resuelve multiplicadores de tarifa en el momento de la solicitud:
 * hora (pico/valle, timezone Salta), zona (más cercana al origen), demanda.
 */

import { getPool, sql } from '../config/database.js';
import type { Coordenada } from '../types/domain.js';
import { parseJsonField } from '../utils/json-field.js';
import type { MultiplicadoresInput } from './tarifas.service.js';
import { geolocalizacionService } from './geolocalizacion.service.js';

type HoraConfig = {
  valle: number;
  pico_manana: number;
  pico_mediodia: number;
  pico_tarde: number;
  noche: number;
  madrugada: number;
  horarios: Record<string, [string, string]>;
};

type DemandaConfig = {
  baja: number;
  media: number;
  alta: number;
  muy_alta: number;
  umbrales_viajes_zona: { baja: number; media: number; alta: number; muy_alta: number };
};

export type MultiplicadoresResueltos = MultiplicadoresInput & {
  franja_hora: string;
  zona_nombre: string | null;
  zona_h3: string | null;
  demanda_nivel: string;
  demanda_viajes_activos: number;
  cadetes_online_cerca: number;
  explicacion: string[];
};

const DEFAULT_HORA: HoraConfig = {
  valle: 1,
  pico_manana: 1.2,
  pico_mediodia: 1.15,
  pico_tarde: 1.25,
  noche: 1.35,
  madrugada: 1.5,
  horarios: {
    pico_manana: ['07:00', '09:30'],
    pico_mediodia: ['12:00', '14:00'],
    pico_tarde: ['17:30', '20:00'],
    noche: ['20:00', '00:00'],
    madrugada: ['00:00', '06:00'],
  },
};

const DEFAULT_DEMANDA: DemandaConfig = {
  baja: 1,
  media: 1.1,
  alta: 1.25,
  muy_alta: 1.4,
  umbrales_viajes_zona: { baja: 0, media: 5, alta: 12, muy_alta: 20 },
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function inRange(nowMin: number, from: string, to: string): boolean {
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a === b) return false;
  if (a < b) return nowMin >= a && nowMin < b;
  // cruza medianoche (ej. 20:00 → 00:00)
  return nowMin >= a || nowMin < b;
}

function horaSaltaParts(at: Date): { minutes: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Salta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { minutes: hour * 60 + minute, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

async function readConfig<T>(clave: string, fallback: T): Promise<T> {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .input('clave', sql.NVarChar(100), clave)
      .query<{ valor: unknown }>(`SELECT valor FROM configuraciones WHERE clave = @clave`);
    if (r.recordset[0]?.valor == null) return fallback;
    return { ...fallback, ...parseJsonField<T>(r.recordset[0].valor, fallback) };
  } catch {
    return fallback;
  }
}

function resolverFranja(cfg: HoraConfig, at: Date): { franja: string; mult: number; horaLabel: string } {
  const { minutes, label } = horaSaltaParts(at);
  const orden = ['pico_manana', 'pico_mediodia', 'pico_tarde', 'noche', 'madrugada'] as const;
  for (const key of orden) {
    const rango = cfg.horarios[key];
    if (rango && inRange(minutes, rango[0], rango[1])) {
      const multMap: Record<string, number> = {
        valle: cfg.valle,
        pico_manana: cfg.pico_manana,
        pico_mediodia: cfg.pico_mediodia,
        pico_tarde: cfg.pico_tarde,
        noche: cfg.noche,
        madrugada: cfg.madrugada,
      };
      return { franja: key, mult: multMap[key] ?? 1, horaLabel: label };
    }
  }
  return { franja: 'valle', mult: cfg.valle ?? 1, horaLabel: label };
}

function nivelDemanda(viajes: number, cfg: DemandaConfig): { nivel: string; mult: number } {
  const u = cfg.umbrales_viajes_zona;
  if (viajes >= u.muy_alta) return { nivel: 'muy_alta', mult: cfg.muy_alta };
  if (viajes >= u.alta) return { nivel: 'alta', mult: cfg.alta };
  if (viajes >= u.media) return { nivel: 'media', mult: cfg.media };
  return { nivel: 'baja', mult: cfg.baja };
}

export class MultiplicadoresService {
  async resolver(params: {
    origen: Coordenada;
    at?: Date;
    clima?: number;
  }): Promise<MultiplicadoresResueltos> {
    const at = params.at ?? new Date();
    const explicacion: string[] = [];

    const [horaCfg, demandaCfg] = await Promise.all([
      readConfig<HoraConfig>('tarifas.multiplicadores.hora', DEFAULT_HORA),
      readConfig<DemandaConfig>('tarifas.multiplicadores.demanda', DEFAULT_DEMANDA),
    ]);

    const { franja, mult: mult_hora, horaLabel } = resolverFranja(horaCfg, at);
    explicacion.push(`Hora ${horaLabel} Salta -> franja ${franja} (x${mult_hora})`);

    let mult_zona = 1;
    let zona_nombre: string | null = null;
    let zona_h3: string | null = null;
    let demanda_viajes_activos = 0;
    let cadetes_online_cerca = 0;

    try {
      const haversineZona = geolocalizacionService.haversineMetersSql('lat_centro', 'lng_centro');
      const haversineViaje = geolocalizacionService.haversineMetersSql('v.origen_lat', 'v.origen_lng');
      const haversineCadete = geolocalizacionService.haversineMetersSql('c.ubicacion_lat', 'c.ubicacion_lng');

      const pool = await getPool();
      const zona = await pool
        .request()
        .input('lat', sql.Float, params.origen.lat)
        .input('lng', sql.Float, params.origen.lng)
        .query<{
          h3_index: string;
          nombre: string | null;
          tarifa_multiplier: number;
          demanda_actual: number;
          dist_m: number;
        }>(`
          SELECT h3_index, nombre, tarifa_multiplier, demanda_actual,
                 ${haversineZona} AS dist_m
          FROM zonas_hexagonos
          WHERE activa = TRUE
          ORDER BY ${haversineZona}
          LIMIT 1
        `);
      const z = zona.recordset[0];
      if (z && Number(z.dist_m) <= 8000) {
        mult_zona = Number(z.tarifa_multiplier) || 1;
        zona_nombre = z.nombre;
        zona_h3 = z.h3_index;
        explicacion.push(
          `Zona ${z.nombre ?? z.h3_index} a ${Math.round(Number(z.dist_m))} m -> x${mult_zona}`,
        );
      } else {
        explicacion.push('Sin zona cercana (<8 km) -> x1.00');
      }

      // Demanda: viajes activos cerca del origen + escasez de cadetes online
      const dem = await pool
        .request()
        .input('lat', sql.Float, params.origen.lat)
        .input('lng', sql.Float, params.origen.lng)
        .query<{ viajes: number; cadetes: number }>(`
          SELECT
            (SELECT COUNT(*)
             FROM viajes v
             WHERE v.estado IN ('buscando_cadete', 'asignado', 'cadete_en_camino', 'cadete_llego', 'en_curso')
               AND ${haversineViaje} <= 5000
               AND v.fecha_solicitud >= (NOW() - INTERVAL '2 hours')
            ) AS viajes,
            (SELECT COUNT(*)
             FROM cadetes c
             WHERE c.disponibilidad = 'online'
               AND c.estado_verificacion = 'aprobado'
               AND c.ubicacion_lat IS NOT NULL
               AND c.ubicacion_lng IS NOT NULL
               AND ${haversineCadete} <= 8000
            ) AS cadetes
        `);
      demanda_viajes_activos = Number(dem.recordset[0]?.viajes ?? 0);
      cadetes_online_cerca = Number(dem.recordset[0]?.cadetes ?? 0);

      // Si hay pocos cadetes vs viajes, sumamos presión artificial a la demanda
      let score = demanda_viajes_activos + Number(z?.demanda_actual ?? 0);
      if (demanda_viajes_activos > 0 && cadetes_online_cerca === 0) score += 15;
      else if (cadetes_online_cerca > 0 && demanda_viajes_activos / cadetes_online_cerca >= 2) {
        score += 8;
      }

      const demRes = nivelDemanda(score, demandaCfg);
      explicacion.push(
        `Demanda ${demRes.nivel}: ${demanda_viajes_activos} viajes activos cerca, ${cadetes_online_cerca} cadetes online -> x${demRes.mult}`,
      );

      return {
        clima: params.clima ?? 1,
        hora: mult_hora,
        zona: mult_zona,
        demanda: demRes.mult,
        franja_hora: franja,
        zona_nombre,
        zona_h3,
        demanda_nivel: demRes.nivel,
        demanda_viajes_activos,
        cadetes_online_cerca,
        explicacion,
      };
    } catch (err) {
      console.error('[multiplicadores] fallback', err);
      explicacion.push('Fallback sin DB de zonas/demanda');
      return {
        clima: params.clima ?? 1,
        hora: mult_hora,
        zona: 1,
        demanda: 1,
        franja_hora: franja,
        zona_nombre: null,
        zona_h3: null,
        demanda_nivel: 'baja',
        demanda_viajes_activos: 0,
        cadetes_online_cerca: 0,
        explicacion,
      };
    }
  }
}

export const multiplicadoresService = new MultiplicadoresService();

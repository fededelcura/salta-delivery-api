/**
 * Despacho por anillos: el pedido se ofrece a cadetes cada vez más lejos a medida que
 * pasa el tiempo sin aceptar (ej. 3 km → 6 km → 10 km, cada 60 s).
 */

import { getPool, sql } from '../config/database.js';
import { ValidationError } from '../utils/errors.js';
import { parseJsonField } from '../utils/json-field.js';
import type { Coordenada } from '../types/domain.js';
import { cadeteModel } from '../models/cadete.model.js';
import { geolocalizacionService } from './geolocalizacion.service.js';
import { emitViajeNuevo, type ViajeNuevoPayload } from '../sockets/index.js';
import { pushService } from './push.service.js';

const CLAVE = 'despacho.anillos';
const CACHE_MS = 30_000;

export interface ConfigAnillos {
  radios_km: number[];
  paso_seg: number;
}

export const ANILLOS_DEFAULT: ConfigAnillos = { radios_km: [3, 6, 10], paso_seg: 60 };

function normalizar(raw: Partial<ConfigAnillos> | null | undefined): ConfigAnillos {
  const radios = (raw?.radios_km ?? [])
    .map(Number)
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  const paso = Number(raw?.paso_seg);
  return {
    radios_km: radios.length ? radios : ANILLOS_DEFAULT.radios_km,
    paso_seg: Number.isFinite(paso) && paso > 0 ? paso : ANILLOS_DEFAULT.paso_seg,
  };
}

/** Índice del anillo vigente para un pedido con `edadMs` de antigüedad. */
export function indiceParaEdad(cfg: ConfigAnillos, edadMs: number): number {
  const idx = Math.floor(Math.max(0, edadMs) / (cfg.paso_seg * 1000));
  return Math.min(idx, cfg.radios_km.length - 1);
}

/** Radio vigente para un pedido con `edadMs` de antigüedad. */
export function radioParaEdad(cfg: ConfigAnillos, edadMs: number): number {
  return cfg.radios_km[indiceParaEdad(cfg, edadMs)];
}

export interface ViajeParaAviso {
  id: string;
  origen: Coordenada;
  origen_direccion: string;
  fecha_solicitud: string | Date;
  tarifa_final?: number | null;
  tarifa_estimada?: number | null;
}

type Emisor = (cadeteId: string, payload: ViajeNuevoPayload) => void;

/** Socket si la app está abierta + push del sistema si está cerrada (el tag las junta en una). */
export const avisarCadete: Emisor = (cadeteId, p) => {
  emitViajeNuevo(cadeteId, p);
  void pushService
    .enviarAUsuario(cadeteId, {
      titulo: 'Pedido nuevo cerca',
      cuerpo: `${p.origen_direccion} · $${Math.round(p.tarifa).toLocaleString('es-AR')} · a ${p.distancia_km} km`,
      tag: `viaje-${p.viaje_id}`,
      url: '/#/cadete/viajes',
      viaje_id: p.viaje_id,
    })
    .catch((err) => console.error('[push] viaje_nuevo', p.viaje_id, err));
};

export class DespachoService {
  private cache: { cfg: ConfigAnillos; at: number } | null = null;
  /** Último anillo avisado por pedido; en memoria (un reinicio puede repetir un aviso). */
  private avisados = new Map<string, number>();

  /**
   * Avisa a los cadetes online que quedaron dentro del anillo vigente y no fueron avisados
   * en un anillo anterior. Devuelve los ids avisados.
   */
  async notificarAnillo(viaje: ViajeParaAviso, emitir: Emisor = avisarCadete, ahora = Date.now()) {
    const cfg = await this.getConfig();
    const idx = indiceParaEdad(cfg, ahora - new Date(viaje.fecha_solicitud).getTime());
    const previo = this.avisados.get(viaje.id);
    if (previo !== undefined && previo >= idx) return [] as string[];

    const radio = cfg.radios_km[idx];
    const radioPrevio = previo !== undefined ? cfg.radios_km[previo] : 0;
    this.avisados.set(viaje.id, idx);

    const cadetes = await cadeteModel.listarDisponiblesCercanos(viaje.origen, radio);
    const avisados: string[] = [];
    for (const c of cadetes) {
      if (!c.ubicacion_actual) continue;
      const dist = geolocalizacionService.distanciaKm(c.ubicacion_actual, viaje.origen);
      if (dist > radio || (previo !== undefined && dist <= radioPrevio)) continue;
      emitir(c.usuario_id, {
        viaje_id: viaje.id,
        origen_direccion: viaje.origen_direccion,
        tarifa: Number(viaje.tarifa_final ?? viaje.tarifa_estimada ?? 0),
        distancia_km: Math.round(dist * 10) / 10,
        radio_km: radio,
      });
      avisados.push(c.usuario_id);
    }
    return avisados;
  }

  /** Olvida pedidos que ya no buscan cadete. */
  podarAvisados(pendientes: Set<string>) {
    for (const id of this.avisados.keys()) {
      if (!pendientes.has(id)) this.avisados.delete(id);
    }
  }

  async getConfig(): Promise<ConfigAnillos> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.cfg;
    let cfg = ANILLOS_DEFAULT;
    try {
      const pool = await getPool();
      const r = await pool
        .request()
        .input('clave', sql.NVarChar(100), CLAVE)
        .query<{ valor: unknown }>(`SELECT valor FROM configuraciones WHERE clave = @clave`);
      cfg = normalizar(parseJsonField<Partial<ConfigAnillos>>(r.recordset[0]?.valor, ANILLOS_DEFAULT));
    } catch {
      cfg = ANILLOS_DEFAULT;
    }
    this.cache = { cfg, at: Date.now() };
    return cfg;
  }

  async setConfig(input: Partial<ConfigAnillos>): Promise<ConfigAnillos> {
    const cfg = normalizar(input);
    if (cfg.radios_km.length > 6 || cfg.radios_km[cfg.radios_km.length - 1] > 50) {
      throw new ValidationError('Hasta 6 anillos y 50 km como máximo');
    }
    const pool = await getPool();
    await pool
      .request()
      .input('clave', sql.NVarChar(100), CLAVE)
      .input('valor', sql.NVarChar(sql.MAX), JSON.stringify(cfg))
      .query(`
        INSERT INTO configuraciones (clave, valor, descripcion)
        VALUES (@clave, @valor::jsonb, 'Radios (km) y segundos entre anillos para ofrecer pedidos a cadetes')
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, fecha_actualizacion = NOW()
      `);
    this.cache = { cfg, at: Date.now() };
    return cfg;
  }

  /** Cadetes online con GPS de los últimos 15 min + orígenes de pedidos de las últimas `horas`. */
  async mapaCalor(horas: number) {
    const pool = await getPool();
    const cadetes = await pool.request().query<{
      usuario_id: string;
      nombre: string;
      lat: number;
      lng: number;
      ubicacion_actualizada_en: Date;
    }>(`
      SELECT c.usuario_id, u.nombre, c.ubicacion_lat AS lat, c.ubicacion_lng AS lng,
             c.ubicacion_actualizada_en
      FROM cadetes c
      INNER JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.disponibilidad = 'online'
        AND c.estado_verificacion = 'aprobado'
        AND u.estado = 'activo'
        AND c.ubicacion_lat IS NOT NULL
        AND c.ubicacion_lng IS NOT NULL
        AND c.ubicacion_actualizada_en >= NOW() - INTERVAL '15 minutes'
    `);
    const pedidos = await pool
      .request()
      .input('horas', sql.Int, horas)
      .query<{ lat: number; lng: number; estado: string }>(`
        SELECT origen_lat AS lat, origen_lng AS lng, estado
        FROM viajes
        WHERE fecha_solicitud >= NOW() - (@horas * INTERVAL '1 hour')
          AND origen_lat IS NOT NULL
          AND origen_lng IS NOT NULL
        ORDER BY fecha_solicitud DESC
        LIMIT 2000
      `);
    return {
      horas,
      anillos: await this.getConfig(),
      cadetes: cadetes.recordset.map((c) => ({
        usuario_id: c.usuario_id,
        nombre: c.nombre,
        lat: Number(c.lat),
        lng: Number(c.lng),
        ubicacion_actualizada_en: new Date(c.ubicacion_actualizada_en).toISOString(),
      })),
      pedidos: pedidos.recordset.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), estado: p.estado })),
    };
  }

  async radioMaximo(): Promise<number> {
    const cfg = await this.getConfig();
    return cfg.radios_km[cfg.radios_km.length - 1];
  }

  async radioActual(fechaSolicitud: string | Date, ahora = Date.now()): Promise<number> {
    const cfg = await this.getConfig();
    return radioParaEdad(cfg, ahora - new Date(fechaSolicitud).getTime());
  }
}

export const despachoService = new DespachoService();

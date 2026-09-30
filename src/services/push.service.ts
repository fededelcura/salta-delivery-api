/**
 * Web Push (VAPID): notificaciones del sistema aunque la app esté cerrada.
 * Sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY el push queda apagado y todo lo demás sigue igual.
 */

import webpush from 'web-push';
import { getPool, sql } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface PushPayload {
  titulo: string;
  cuerpo: string;
  tag: string;
  url: string;
  viaje_id?: string;
}

export interface SuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface SuscripcionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Devuelve el status HTTP del servicio de push (201 ok; 404/410 = suscripción muerta). */
export type EnviadorPush = (sub: SuscripcionRow, payload: string) => Promise<number>;

/** Un pedido que tarda más de esto en entregarse ya no sirve. */
const TTL_SEG = 120;

let vapidListo = false;

const enviadorWebPush: EnviadorPush = async (sub, payload) => {
  if (!vapidListo) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidListo = true;
  }
  try {
    const r = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: TTL_SEG, urgency: 'high' },
    );
    return r.statusCode;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status) return status;
    throw err;
  }
};

interface PushDeps {
  enviar?: EnviadorPush;
  pool?: typeof getPool;
  habilitado?: () => boolean;
}

export class PushService {
  private enviar: EnviadorPush;
  private getPool: typeof getPool;
  private estaHabilitado: () => boolean;

  constructor(deps: PushDeps = {}) {
    this.enviar = deps.enviar ?? enviadorWebPush;
    this.getPool = deps.pool ?? getPool;
    this.estaHabilitado =
      deps.habilitado ?? (() => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY));
  }

  habilitado(): boolean {
    return this.estaHabilitado();
  }

  clavePublica(): string {
    if (!this.habilitado()) {
      throw new AppError('Notificaciones push no disponibles', 503, 'PUSH_NO_DISPONIBLE');
    }
    return env.VAPID_PUBLIC_KEY;
  }

  async suscribir(usuarioId: string, sub: SuscripcionInput, userAgent?: string) {
    const pool = await this.getPool();
    await pool
      .request()
      .input('usuario', sql.UniqueIdentifier, usuarioId)
      .input('endpoint', sql.NVarChar(sql.MAX), sub.endpoint)
      .input('p256dh', sql.NVarChar(sql.MAX), sub.keys.p256dh)
      .input('auth', sql.NVarChar(sql.MAX), sub.keys.auth)
      .input('ua', sql.NVarChar(300), userAgent?.slice(0, 300) ?? null)
      .query(`
        INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, user_agent)
        VALUES (@usuario, @endpoint, @p256dh, @auth, @ua)
        ON CONFLICT (endpoint) DO UPDATE
          SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
              auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
      `);
    return { suscripto: true };
  }

  async desuscribir(usuarioId: string, endpoint: string) {
    const pool = await this.getPool();
    await pool
      .request()
      .input('usuario', sql.UniqueIdentifier, usuarioId)
      .input('endpoint', sql.NVarChar(sql.MAX), endpoint)
      .query(`DELETE FROM push_suscripciones WHERE endpoint = @endpoint AND usuario_id = @usuario`);
    return { suscripto: false };
  }

  /** Manda a todas las suscripciones del usuario; borra las que el servicio da por muertas. */
  async enviarAUsuario(usuarioId: string, payload: PushPayload) {
    if (!this.habilitado()) return { enviados: 0, borrados: 0 };
    const pool = await this.getPool();
    const subs = await pool
      .request()
      .input('usuario', sql.UniqueIdentifier, usuarioId)
      .query<SuscripcionRow>(
        `SELECT id, endpoint, p256dh, auth FROM push_suscripciones WHERE usuario_id = @usuario`,
      );
    const body = JSON.stringify(payload);
    let enviados = 0;
    let borrados = 0;
    for (const sub of subs.recordset) {
      let status: number;
      try {
        status = await this.enviar(sub, body);
      } catch (err) {
        console.error('[push] envío falló', sub.id, err instanceof Error ? err.message : err);
        continue;
      }
      if (status === 404 || status === 410) {
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, sub.id)
          .query(`DELETE FROM push_suscripciones WHERE id = @id`);
        borrados += 1;
      } else if (status >= 200 && status < 300) {
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, sub.id)
          .query(`UPDATE push_suscripciones SET ultimo_envio = NOW() WHERE id = @id`);
        enviados += 1;
      } else {
        console.warn('[push] respuesta inesperada', sub.id, status);
      }
    }
    return { enviados, borrados };
  }
}

export const pushService = new PushService();

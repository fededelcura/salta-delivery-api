/**
 * Pago del envío de pedidos de negocios: link público por token y cuenta corriente del negocio.
 */

import { getPool, sql } from '../config/database.js';
import { env } from '../config/env.js';
import { pagosService } from '../services/pagos.service.js';
import { AppError, NotFoundError } from '../utils/errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResumenPagoEnvio {
  viaje_id: string;
  negocio: string;
  destino_direccion: string;
  destinatario_nombre: string | null;
  monto: number;
  estado_viaje: string;
  estado_pago: string;
  fecha_solicitud: string;
  pago_disponible: boolean;
}

export interface EnvioCuentaNegocio {
  id: string;
  fecha_solicitud: string;
  destino_direccion: string;
  destinatario_nombre: string | null;
  importe_pedido: number | null;
  monto: number;
  estado: string;
  estado_pago: string;
}

interface ResumenRow {
  id: string;
  negocio: string | null;
  destino_direccion: string;
  destinatario_nombre: string | null;
  tarifa_estimada: string | number | null;
  tarifa_final: string | number | null;
  estado: string;
  estado_pago: string;
  fecha_solicitud: Date | string;
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function montoDe(row: { tarifa_final: unknown; tarifa_estimada: unknown }): number {
  return Number(row.tarifa_final ?? row.tarifa_estimada ?? 0);
}

export class PagoEnvioModel {
  private async rowPorToken(token: string): Promise<ResumenRow> {
    if (!UUID_RE.test(token)) throw new NotFoundError('Link de pago inválido');
    const pool = await getPool();
    const r = await pool
      .request()
      .input('token', sql.UniqueIdentifier, token)
      .query<ResumenRow>(`
        SELECT v.id, u.nombre AS negocio, v.destino_direccion, v.destinatario_nombre,
               v.tarifa_estimada, v.tarifa_final, v.estado, v.estado_pago, v.fecha_solicitud
        FROM viajes v
        INNER JOIN usuarios u ON u.id = v.cliente_id
        WHERE v.pago_token = @token
      `);
    const row = r.recordset[0];
    if (!row) throw new NotFoundError('Link de pago inválido o vencido');
    return row;
  }

  async resumenPorToken(token: string): Promise<ResumenPagoEnvio> {
    const row = await this.rowPorToken(token);
    return {
      viaje_id: row.id,
      negocio: row.negocio ?? 'Negocio',
      destino_direccion: row.destino_direccion,
      destinatario_nombre: row.destinatario_nombre,
      monto: montoDe(row),
      estado_viaje: row.estado,
      estado_pago: row.estado_pago,
      fecha_solicitud: iso(row.fecha_solicitud),
      pago_disponible: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
    };
  }

  async iniciarMercadoPago(token: string): Promise<{ init_point: string }> {
    const row = await this.rowPorToken(token);
    if (row.estado_pago === 'aprobado') {
      throw new AppError('Este envío ya está pagado', 409, 'YA_PAGADO');
    }
    if (row.estado === 'cancelado') {
      throw new AppError('El envío fue cancelado', 409, 'VIAJE_CANCELADO');
    }
    if (!env.MERCADOPAGO_ACCESS_TOKEN) {
      throw new AppError(
        'El pago online todavía no está disponible. Consultá con el negocio.',
        503,
        'PAGO_NO_DISPONIBLE',
      );
    }
    const pref = await pagosService.crearPreferencia({
      titulo: `Envío ${row.negocio ?? 'Salta Delivery'}`,
      monto: montoDe(row),
      referenciaExterna: `viaje_${row.id}`,
      metadata: { viaje_id: row.id, tipo: 'envio_negocio' },
    });
    return { init_point: pref.init_point };
  }

  async cuentaNegocio(clienteId: string): Promise<{
    envios: EnvioCuentaNegocio[];
    total_pendiente: number;
  }> {
    const pool = await getPool();
    const r = await pool
      .request()
      .input('cid', sql.UniqueIdentifier, clienteId)
      .query<{
        id: string;
        fecha_solicitud: Date | string;
        destino_direccion: string;
        destinatario_nombre: string | null;
        importe_pedido: string | number | null;
        tarifa_estimada: string | number | null;
        tarifa_final: string | number | null;
        estado: string;
        estado_pago: string;
      }>(`
        SELECT id, fecha_solicitud, destino_direccion, destinatario_nombre, importe_pedido,
               tarifa_estimada, tarifa_final, estado, estado_pago
        FROM viajes
        WHERE cliente_id = @cid
          AND metodo_pago = 'cuenta_negocio'
          AND estado_pago = 'pendiente'
          AND estado <> 'cancelado'
        ORDER BY fecha_solicitud DESC
        LIMIT 500
      `);
    const envios = r.recordset.map((row) => ({
      id: row.id,
      fecha_solicitud: iso(row.fecha_solicitud),
      destino_direccion: row.destino_direccion,
      destinatario_nombre: row.destinatario_nombre,
      importe_pedido: row.importe_pedido != null ? Number(row.importe_pedido) : null,
      monto: montoDe(row),
      estado: row.estado,
      estado_pago: row.estado_pago,
    }));
    const total = envios.reduce((acc, e) => acc + e.monto, 0);
    return { envios, total_pendiente: Math.round(total * 100) / 100 };
  }

  /** Marca cobrado un envío de negocio (cuenta corriente o link de pago). */
  async marcarCobrado(viajeId: string): Promise<{ id: string; estado_pago: 'aprobado' }> {
    const pool = await getPool();
    const r = await pool
      .request()
      .input('id', sql.UniqueIdentifier, viajeId)
      .query<{ id: string }>(`
        UPDATE viajes
        SET estado_pago = 'aprobado'
        WHERE id = @id
          AND (metodo_pago = 'cuenta_negocio' OR pago_token IS NOT NULL)
        RETURNING id
      `);
    if (!r.recordset[0]) {
      throw new NotFoundError('Envío de negocio no encontrado');
    }
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, viajeId)
      .query(`
        UPDATE pagos
        SET estado = 'aprobado', fecha_pago = COALESCE(fecha_pago, NOW())
        WHERE viaje_id = @id AND tipo = 'viaje'
      `);
    return { id: viajeId, estado_pago: 'aprobado' };
  }
}

export const pagoEnvioModel = new PagoEnvioModel();

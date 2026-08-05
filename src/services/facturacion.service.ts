/**
 * Emite comprobantes internos y registra pagos al finalizar un viaje.
 */

import { getPool, sql } from '../config/database.js';
import { cadeteModel } from '../models/cadete.model.js';
import {
  comisionModel,
  comprobanteModel,
  type Comprobante,
} from '../models/facturacion.model.js';
import { liquidacionModel } from '../models/liquidacion.model.js';
import { viajeModel } from '../models/viaje.model.js';
import type { DetalleTarifa } from '../types/domain.js';
import { AppError } from '../utils/errors.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class FacturacionService {
  /** Idempotente: si ya hay 2 comprobantes, los devuelve. */
  async emitirAlFinalizar(viajeId: string): Promise<Comprobante[]> {
    if (await comprobanteModel.existenParaViaje(viajeId)) {
      return comprobanteModel.listarPorViaje(viajeId);
    }

    const viaje = await viajeModel.getById(viajeId);
    if (viaje.estado !== 'finalizado') {
      throw new AppError('El viaje aún no está finalizado', 400, 'VIAJE_NO_FINALIZADO');
    }
    if (!viaje.cadete_id) {
      throw new AppError('Viaje sin cadete', 400, 'SIN_CADETE');
    }

    const cadete = await cadeteModel.getById(viaje.cadete_id);
    const tarifa = Number(viaje.tarifa_final ?? viaje.tarifa_estimada ?? 0);
    if (tarifa <= 0) {
      throw new AppError('Tarifa inválida para facturar', 400, 'TARIFA_INVALIDA');
    }

    const comision_pct = await comisionModel.getPct(
      cadete.plan_suscripcion,
      viaje.tipo_servicio,
    );
    const comision_monto = round2((tarifa * comision_pct) / 100);
    const pago_cadete = round2(tarifa - comision_monto);

    const detalleBase: DetalleTarifa = {
      ...(viaje.detalle_tarifa ?? {
        base_fija: 0,
        distancia: 0,
        tiempo: 0,
        subtotal: tarifa,
        mult_clima: 1,
        mult_hora: 1,
        mult_zona: 1,
        mult_demanda: 1,
        descuento_plan_pct: 0,
        tarifa,
        comision_pct,
        comision_plataforma: comision_monto,
        pago_cadete,
      }),
      tarifa,
      comision_pct,
      comision_plataforma: comision_monto,
      pago_cadete,
    };

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, viajeId)
        .input('tarifa', sql.Decimal(12, 2), tarifa)
        .input('comision', sql.Decimal(12, 2), comision_monto)
        .input('pago', sql.Decimal(12, 2), pago_cadete)
        .input('detalle', sql.NVarChar(sql.MAX), JSON.stringify(detalleBase))
        .query(`
          UPDATE dbo.viajes
          SET tarifa_final = @tarifa,
              comision_plataforma = @comision,
              pago_cadete = @pago,
              detalle_tarifa = @detalle
          WHERE id = @id
        `);

      const previo = Number(viaje.pago_cadete ?? 0);
      const delta = round2(pago_cadete - previo);
      if (delta !== 0) {
        await new sql.Request(tx)
          .input('cid', sql.UniqueIdentifier, viaje.cadete_id)
          .input('delta', sql.Decimal(12, 2), delta)
          .query(`
            UPDATE dbo.cadetes
            SET total_ganado = total_ganado + @delta
            WHERE usuario_id = @cid
          `);
      }

      const numCliente = await comprobanteModel.nextNumero(tx);
      const numCadete = await comprobanteModel.nextNumero(tx);

      const snapshot = {
        origen: viaje.origen_direccion,
        destino: viaje.destino_direccion,
        distancia_km: viaje.distancia_km,
        plan_cadete: cadete.plan_suscripcion,
        detalle_tarifa: detalleBase,
      };

      await comprobanteModel.insert(tx, {
        numero: numCliente,
        viaje_id: viajeId,
        usuario_id: viaje.cliente_id,
        rol_destino: 'cliente',
        tarifa_total: tarifa,
        comision_pct,
        comision_monto,
        pago_cadete,
        monto_usuario: tarifa,
        metodo_pago: viaje.metodo_pago,
        tipo_servicio: viaje.tipo_servicio,
        detalle: { ...snapshot, concepto: 'Pago del viaje' },
      });

      await comprobanteModel.insert(tx, {
        numero: numCadete,
        viaje_id: viajeId,
        usuario_id: viaje.cadete_id,
        rol_destino: 'cadete',
        tarifa_total: tarifa,
        comision_pct,
        comision_monto,
        pago_cadete,
        monto_usuario: pago_cadete,
        metodo_pago: viaje.metodo_pago,
        tipo_servicio: viaje.tipo_servicio,
        detalle: { ...snapshot, concepto: 'Liquidación del viaje' },
      });

      await new sql.Request(tx)
        .input('uid', sql.UniqueIdentifier, viaje.cliente_id)
        .input('viaje', sql.UniqueIdentifier, viajeId)
        .input('monto', sql.Decimal(12, 2), tarifa)
        .input('metodo', sql.NVarChar(20), viaje.metodo_pago)
        .input('url', sql.NVarChar(1000), numCliente)
        .input(
          'meta',
          sql.NVarChar(sql.MAX),
          JSON.stringify({ comprobante_numero: numCliente, tipo: 'viaje' }),
        )
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.pagos
            WHERE viaje_id = @viaje AND tipo = N'viaje' AND usuario_id = @uid
          )
          INSERT INTO dbo.pagos (
            usuario_id, viaje_id, tipo, monto, metodo_pago, estado, fecha_pago, metadata_json, factura_url
          ) VALUES (
            @uid, @viaje, N'viaje', @monto, @metodo, N'aprobado', SYSDATETIMEOFFSET(), @meta, @url
          );
        `);

      await new sql.Request(tx)
        .input('uid', sql.UniqueIdentifier, viaje.cadete_id)
        .input('viaje', sql.UniqueIdentifier, viajeId)
        .input('monto', sql.Decimal(12, 2), comision_monto)
        .input('metodo', sql.NVarChar(20), viaje.metodo_pago)
        .input('url', sql.NVarChar(1000), numCadete)
        .input(
          'meta',
          sql.NVarChar(sql.MAX),
          JSON.stringify({
            comprobante_numero: numCadete,
            comision_pct,
            tarifa,
            pago_cadete,
          }),
        )
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.pagos
            WHERE viaje_id = @viaje AND tipo = N'comision'
          )
          INSERT INTO dbo.pagos (
            usuario_id, viaje_id, tipo, monto, metodo_pago, estado, fecha_pago, metadata_json, factura_url
          ) VALUES (
            @uid, @viaje, N'comision', @monto, @metodo, N'aprobado', SYSDATETIMEOFFSET(), @meta, @url
          );
        `);

      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    try {
      await liquidacionModel.crearDesdeViaje({
        viaje_id: viajeId,
        cadete_id: viaje.cadete_id,
        cliente_id: viaje.cliente_id,
        tarifa_cliente: tarifa,
        comision_retenida: comision_monto,
        comision_pct,
        monto_a_transferir: pago_cadete,
        metodo_pago_cliente: viaje.metodo_pago,
        cbu_destino: cadete.cbu,
        alias_destino: cadete.alias_bancario,
        banco_destino: cadete.banco,
        titular_destino: cadete.titular_cuenta,
      });
    } catch (err) {
      console.error('[liquidacion] crearDesdeViaje', viajeId, err);
    }

    return comprobanteModel.listarPorViaje(viajeId);
  }
}

export const facturacionService = new FacturacionService();

/**
 * Pedidos de negocios: quién paga el envío según el importe del pedido.
 * importe >= umbral → paga el negocio (cuenta corriente); si no → paga el cliente final (link de pago).
 */

import { getPool, sql } from '../config/database.js';
import type { Cliente, PagadorEnvio } from '../types/domain.js';
import { ValidationError } from '../utils/errors.js';
import { parseJsonField } from '../utils/json-field.js';

const CLAVE_UMBRAL = 'negocios.umbral_envio_default';
const UMBRAL_FALLBACK = 20000;

export function esNegocio(cliente: Pick<Cliente, 'tipo_cuenta'>): boolean {
  return cliente.tipo_cuenta === 'restaurante' || cliente.tipo_cuenta === 'comercio';
}

export class EnvioNegocioService {
  async getUmbralDefault(): Promise<number> {
    try {
      const pool = await getPool();
      const r = await pool
        .request()
        .input('clave', sql.NVarChar(100), CLAVE_UMBRAL)
        .query<{ valor: unknown }>(`SELECT valor FROM configuraciones WHERE clave = @clave`);
      const parsed = parseJsonField<{ monto?: number }>(r.recordset[0]?.valor, {
        monto: UMBRAL_FALLBACK,
      });
      const monto = Number(parsed.monto);
      return Number.isFinite(monto) && monto >= 0 ? monto : UMBRAL_FALLBACK;
    } catch {
      return UMBRAL_FALLBACK;
    }
  }

  async setUmbralDefault(monto: number): Promise<{ monto: number }> {
    if (!Number.isFinite(monto) || monto < 0) {
      throw new ValidationError('El umbral debe ser un monto mayor o igual a 0');
    }
    const pool = await getPool();
    await pool
      .request()
      .input('clave', sql.NVarChar(100), CLAVE_UMBRAL)
      .input('valor', sql.NVarChar(sql.MAX), JSON.stringify({ monto }))
      .query(`
        INSERT INTO configuraciones (clave, valor, descripcion)
        VALUES (@clave, @valor::jsonb, 'Importe del pedido desde el cual el negocio paga el envío')
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, fecha_actualizacion = NOW()
      `);
    return { monto };
  }

  /** Umbral efectivo del negocio: el propio o el global. */
  async umbralPara(cliente: Pick<Cliente, 'umbral_envio_negocio'>) {
    const propio = cliente.umbral_envio_negocio;
    if (propio != null) return { umbral: propio, origen: 'negocio' as const };
    return { umbral: await this.getUmbralDefault(), origen: 'global' as const };
  }

  async resolverPagador(
    cliente: Pick<Cliente, 'umbral_envio_negocio'>,
    importePedido: number,
  ): Promise<{ pagador: PagadorEnvio; umbral: number }> {
    const { umbral } = await this.umbralPara(cliente);
    return { pagador: importePedido >= umbral ? 'negocio' : 'cliente', umbral };
  }
}

export const envioNegocioService = new EnvioNegocioService();

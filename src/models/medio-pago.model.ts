import { getPool, sql } from '../config/database.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

export type MedioPagoTipo = 'tarjeta' | 'mercadopago' | 'billetera';

export interface MedioPago {
  id: string;
  usuario_id: string;
  tipo: MedioPagoTipo;
  alias: string;
  marca: string | null;
  ultimos_4: string | null;
  vencimiento_mes: number | null;
  vencimiento_anio: number | null;
  titular: string | null;
  mp_email: string | null;
  mp_alias: string | null;
  saldo: number;
  es_predeterminado: boolean;
  activo: boolean;
}

interface MedioRow {
  id: string;
  usuario_id: string;
  tipo: MedioPagoTipo;
  alias: string;
  marca: string | null;
  ultimos_4: string | null;
  vencimiento_mes: number | null;
  vencimiento_anio: number | null;
  titular: string | null;
  mp_email: string | null;
  mp_alias: string | null;
  saldo: number;
  es_predeterminado: boolean;
  activo: boolean;
}

function mapMedio(row: MedioRow): MedioPago {
  return {
    id: String(row.id),
    usuario_id: String(row.usuario_id),
    tipo: row.tipo,
    alias: row.alias,
    marca: row.marca,
    ultimos_4: row.ultimos_4,
    vencimiento_mes: row.vencimiento_mes != null ? Number(row.vencimiento_mes) : null,
    vencimiento_anio: row.vencimiento_anio != null ? Number(row.vencimiento_anio) : null,
    titular: row.titular,
    mp_email: row.mp_email,
    mp_alias: row.mp_alias,
    saldo: Number(row.saldo),
    es_predeterminado: Boolean(row.es_predeterminado),
    activo: Boolean(row.activo),
  };
}

function detectarMarca(numero: string): string {
  if (/^4/.test(numero)) return 'Visa';
  if (/^5[1-5]/.test(numero) || /^2[2-7]/.test(numero)) return 'Mastercard';
  if (/^3[47]/.test(numero)) return 'Amex';
  return 'Tarjeta';
}

export class MedioPagoModel {
  async listar(usuarioId: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query<MedioRow>(`
        SELECT *
        FROM medios_pago_cliente
        WHERE usuario_id = @uid AND activo = TRUE
        ORDER BY es_predeterminado DESC, fecha_creacion DESC
      `);
    return result.recordset.map(mapMedio);
  }

  async getById(usuarioId: string, id: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .input('id', sql.UniqueIdentifier, id)
      .query<MedioRow>(`
        SELECT * FROM medios_pago_cliente
        WHERE id = @id AND usuario_id = @uid AND activo = TRUE
      `);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError('Medio de pago no encontrado');
    return mapMedio(row);
  }

  private async clearDefault(usuarioId: string) {
    const pool = await getPool();
    await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query(`
        UPDATE medios_pago_cliente
        SET es_predeterminado = FALSE
        WHERE usuario_id = @uid
      `);
  }

  async crearTarjeta(
    usuarioId: string,
    input: {
      alias?: string;
      numero: string;
      titular: string;
      vencimiento_mes: number;
      vencimiento_anio: number;
      es_predeterminado?: boolean;
    },
  ) {
    const digits = input.numero.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      throw new ValidationError('Número de tarjeta inválido');
    }
    const ultimos_4 = digits.slice(-4);
    const marca = detectarMarca(digits);
    const alias = input.alias?.trim() || `${marca} •••• ${ultimos_4}`;

    const pool = await getPool();
    if (input.es_predeterminado !== false) {
      await this.clearDefault(usuarioId);
    }

    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .input('alias', sql.NVarChar(80), alias)
      .input('marca', sql.NVarChar(30), marca)
      .input('ultimos', sql.Char(4), ultimos_4)
      .input('mes', sql.TinyInt, input.vencimiento_mes)
      .input('anio', sql.SmallInt, input.vencimiento_anio)
      .input('titular', sql.NVarChar(150), input.titular.trim())
      .input('def', sql.Bit, input.es_predeterminado === false ? 0 : 1)
      .query<{ id: string }>(`
        INSERT INTO medios_pago_cliente (
          usuario_id, tipo, alias, marca, ultimos_4, vencimiento_mes, vencimiento_anio,
          titular, es_predeterminado
        )
        VALUES (@uid, 'tarjeta', @alias, @marca, @ultimos, @mes, @anio, @titular, @def)
        RETURNING id
      `);

    const id = result.recordset[0]?.id;
    if (!id) throw new Error('No se pudo guardar la tarjeta');
    return this.getById(usuarioId, id);
  }

  async crearMercadoPago(
    usuarioId: string,
    input: {
      alias?: string;
      mp_email: string;
      mp_alias?: string;
      es_predeterminado?: boolean;
    },
  ) {
    const email = input.mp_email.trim().toLowerCase();
    if (!email.includes('@')) throw new ValidationError('Email de Mercado Pago inválido');

    const pool = await getPool();
    const exists = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .input('email', sql.NVarChar(255), email)
      .query(`
        SELECT 1 AS x FROM medios_pago_cliente
        WHERE usuario_id = @uid AND activo = TRUE AND tipo = 'mercadopago' AND mp_email = @email
      `);
    if (exists.recordset[0]) {
      throw new ConflictError('Esa cuenta de Mercado Pago ya está cargada');
    }

    if (input.es_predeterminado !== false) {
      await this.clearDefault(usuarioId);
    }

    const alias = input.alias?.trim() || `MP ${email}`;
    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .input('alias', sql.NVarChar(80), alias)
      .input('email', sql.NVarChar(255), email)
      .input('mpalias', sql.NVarChar(80), input.mp_alias?.trim() || null)
      .input('def', sql.Bit, input.es_predeterminado === false ? 0 : 1)
      .query<{ id: string }>(`
        INSERT INTO medios_pago_cliente (
          usuario_id, tipo, alias, mp_email, mp_alias, es_predeterminado
        )
        VALUES (@uid, 'mercadopago', @alias, @email, @mpalias, @def)
        RETURNING id
      `);

    const id = result.recordset[0]?.id;
    if (!id) throw new Error('No se pudo guardar Mercado Pago');
    return this.getById(usuarioId, id);
  }

  async asegurarBilletera(usuarioId: string) {
    const pool = await getPool();
    const existing = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query<MedioRow>(`
        SELECT * FROM medios_pago_cliente
        WHERE usuario_id = @uid AND tipo = 'billetera' AND activo = TRUE
        LIMIT 1
      `);
    if (existing.recordset[0]) return mapMedio(existing.recordset[0]);

    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query<{ id: string }>(`
        INSERT INTO medios_pago_cliente (usuario_id, tipo, alias, saldo)
        VALUES (@uid, 'billetera', 'Mi billetera Salta', 0)
        RETURNING id
      `);
    return this.getById(usuarioId, result.recordset[0]!.id);
  }

  async recargarBilletera(usuarioId: string, monto: number) {
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new ValidationError('Monto de recarga inválido');
    }
    const billetera = await this.asegurarBilletera(usuarioId);
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, billetera.id)
      .input('monto', sql.Decimal(12, 2), monto)
      .query(`
        UPDATE medios_pago_cliente
        SET saldo = saldo + @monto,
            fecha_actualizacion = NOW()
        WHERE id = @id
      `);
    return this.getById(usuarioId, billetera.id);
  }

  async setPredeterminado(usuarioId: string, id: string) {
    await this.getById(usuarioId, id);
    const pool = await getPool();
    await this.clearDefault(usuarioId);
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query(`
        UPDATE medios_pago_cliente
        SET es_predeterminado = TRUE, fecha_actualizacion = NOW()
        WHERE id = @id AND usuario_id = @uid
      `);
    return this.getById(usuarioId, id);
  }

  async eliminar(usuarioId: string, id: string) {
    await this.getById(usuarioId, id);
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query(`
        UPDATE medios_pago_cliente
        SET activo = FALSE, es_predeterminado = FALSE, fecha_actualizacion = NOW()
        WHERE id = @id AND usuario_id = @uid
      `);
    return { id, eliminado: true };
  }
}

export const medioPagoModel = new MedioPagoModel();

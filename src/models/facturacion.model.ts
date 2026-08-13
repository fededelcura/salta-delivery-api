import { getPool, sql, SqlTransaction } from '../config/database.js';
import type { PlanCadete, TipoServicio } from '../types/domain.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { parseJsonField } from '../utils/json-field.js';

export type ConfigComision = {
  id: string;
  plan_cadete: PlanCadete;
  tipo_servicio: TipoServicio;
  comision_pct: number;
};

const FALLBACK: Record<PlanCadete, number> = {
  trial: 15,
  silver: 13,
  gold: 10,
  premium: 8,
};

let cache: { at: number; rows: ConfigComision[] } | null = null;
const CACHE_MS = 30_000;

function mapRow(row: {
  id: string;
  plan_cadete: string;
  tipo_servicio: string;
  comision_pct: number;
}): ConfigComision {
  return {
    id: String(row.id),
    plan_cadete: row.plan_cadete as PlanCadete,
    tipo_servicio: row.tipo_servicio as TipoServicio,
    comision_pct: Number(row.comision_pct),
  };
}

export class ComisionModel {
  async listar(): Promise<ConfigComision[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      plan_cadete: string;
      tipo_servicio: string;
      comision_pct: number;
    }>(`
      SELECT id, plan_cadete, tipo_servicio, comision_pct
      FROM config_comisiones
      ORDER BY plan_cadete, tipo_servicio
    `);
    const rows = result.recordset.map(mapRow);
    cache = { at: Date.now(), rows };
    return rows;
  }

  invalidateCache(): void {
    cache = null;
  }

  async getPct(plan: PlanCadete, tipo: TipoServicio): Promise<number> {
    const rows = await this.listar();
    const exact = rows.find((r) => r.plan_cadete === plan && r.tipo_servicio === tipo);
    if (exact) return exact.comision_pct;
    return FALLBACK[plan] ?? 15;
  }

  async upsertMany(
    items: Array<{ plan_cadete: PlanCadete; tipo_servicio: TipoServicio; comision_pct: number }>,
  ): Promise<ConfigComision[]> {
    if (!items.length) throw new ValidationError('Sin comisiones para guardar');
    for (const item of items) {
      if (item.comision_pct < 0 || item.comision_pct > 100) {
        throw new ValidationError('comision_pct debe estar entre 0 y 100');
      }
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const item of items) {
        const req = new sql.Request(tx);
        await req
          .input('plan', sql.NVarChar(20), item.plan_cadete)
          .input('tipo', sql.NVarChar(20), item.tipo_servicio)
          .input('pct', sql.Decimal(5, 2), item.comision_pct)
          .query(`
            INSERT INTO config_comisiones (plan_cadete, tipo_servicio, comision_pct)
            VALUES (@plan, @tipo, @pct)
            ON CONFLICT ON CONSTRAINT uq_config_comisiones
            DO UPDATE SET comision_pct = EXCLUDED.comision_pct
          `);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    this.invalidateCache();
    return this.listar();
  }
}

export type Comprobante = {
  id: string;
  numero: string;
  viaje_id: string;
  usuario_id: string;
  rol_destino: 'cliente' | 'cadete';
  tarifa_total: number;
  comision_pct: number;
  comision_monto: number;
  pago_cadete: number;
  monto_usuario: number;
  metodo_pago: string;
  tipo_servicio: string;
  detalle: Record<string, unknown>;
  fecha_emision: string;
  /** Enriquecido en listado admin */
  cliente_nombre?: string;
  cadete_nombre?: string;
  usuario_nombre?: string;
};

type ComprobanteRow = {
  id: string;
  numero: string;
  viaje_id: string;
  usuario_id: string;
  rol_destino: string;
  tarifa_total: number;
  comision_pct: number;
  comision_monto: number;
  pago_cadete: number;
  monto_usuario: number;
  metodo_pago: string;
  tipo_servicio: string;
  detalle_json: string;
  fecha_emision: Date;
  cliente_nombre?: string;
  cadete_nombre?: string;
  usuario_nombre?: string;
};

function mapComprobante(row: ComprobanteRow): Comprobante {
  const detalle = parseJsonField<Record<string, unknown>>(row.detalle_json, {});
  return {
    id: String(row.id),
    numero: row.numero,
    viaje_id: String(row.viaje_id),
    usuario_id: String(row.usuario_id),
    rol_destino: row.rol_destino as 'cliente' | 'cadete',
    tarifa_total: Number(row.tarifa_total),
    comision_pct: Number(row.comision_pct),
    comision_monto: Number(row.comision_monto),
    pago_cadete: Number(row.pago_cadete),
    monto_usuario: Number(row.monto_usuario),
    metodo_pago: row.metodo_pago,
    tipo_servicio: row.tipo_servicio,
    detalle,
    fecha_emision: new Date(row.fecha_emision).toISOString(),
    cliente_nombre: row.cliente_nombre,
    cadete_nombre: row.cadete_nombre,
    usuario_nombre: row.usuario_nombre,
  };
}

export class ComprobanteModel {
  async listarAdmin(filtros: {
    rol?: 'cliente' | 'cadete';
    q?: string;
    desde?: string;
    hasta?: string;
    tipo_servicio?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: Comprobante[];
    total: number;
    page: number;
    pageSize: number;
    stats: {
      cantidad: number;
      tarifa_total: number;
      comision_total: number;
      pago_cadetes: number;
    };
  }> {
    const page = filtros.page ?? 1;
    const pageSize = filtros.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const pool = await getPool();
    const req = pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, pageSize)
      .input('rol', sql.NVarChar(20), filtros.rol ?? null)
      .input('q', sql.NVarChar(150), filtros.q?.trim() ? `%${filtros.q.trim()}%` : null)
      .input('desde', sql.DateTimeOffset, filtros.desde ? new Date(filtros.desde) : null)
      .input('hasta', sql.DateTimeOffset, filtros.hasta ? new Date(filtros.hasta) : null)
      .input('tipo', sql.NVarChar(20), filtros.tipo_servicio ?? null);

    const where = `
      WHERE (@rol IS NULL OR c.rol_destino = @rol)
        AND (@tipo IS NULL OR c.tipo_servicio = @tipo)
        AND (@desde IS NULL OR c.fecha_emision >= @desde)
        AND (@hasta IS NULL OR c.fecha_emision < (@hasta::timestamptz + INTERVAL '1 day'))
        AND (
          @q IS NULL
          OR c.numero LIKE @q
          OR cli.nombre LIKE @q
          OR cad.nombre LIKE @q
          OR u.nombre LIKE @q
          OR cli.email LIKE @q
          OR cad.email LIKE @q
        )
    `;

    const result = await req.query<ComprobanteRow & { total: number }>(`
      SELECT COUNT(*) OVER() AS total,
             c.id, c.numero, c.viaje_id, c.usuario_id, c.rol_destino,
             c.tarifa_total, c.comision_pct, c.comision_monto, c.pago_cadete, c.monto_usuario,
             c.metodo_pago, c.tipo_servicio, c.detalle_json, c.fecha_emision,
             u.nombre AS usuario_nombre,
             cli.nombre AS cliente_nombre,
             cad.nombre AS cadete_nombre
      FROM comprobantes c
      INNER JOIN viajes v ON v.id = c.viaje_id
      INNER JOIN usuarios u ON u.id = c.usuario_id
      INNER JOIN usuarios cli ON cli.id = v.cliente_id
      LEFT JOIN usuarios cad ON cad.id = v.cadete_id
      ${where}
      ORDER BY c.fecha_emision DESC
      OFFSET @offset LIMIT @limit
    `);

    const statsReq = pool
      .request()
      .input('rol', sql.NVarChar(20), filtros.rol ?? null)
      .input('q', sql.NVarChar(150), filtros.q?.trim() ? `%${filtros.q.trim()}%` : null)
      .input('desde', sql.DateTimeOffset, filtros.desde ? new Date(filtros.desde) : null)
      .input('hasta', sql.DateTimeOffset, filtros.hasta ? new Date(filtros.hasta) : null)
      .input('tipo', sql.NVarChar(20), filtros.tipo_servicio ?? null);

    // Totales financieros sobre comprobantes de cliente (1 por viaje) para no duplicar
    const statsWhere = `
      WHERE c.rol_destino = 'cliente'
        AND (@rol IS NULL OR @rol = 'cliente')
        AND (@tipo IS NULL OR c.tipo_servicio = @tipo)
        AND (@desde IS NULL OR c.fecha_emision >= @desde)
        AND (@hasta IS NULL OR c.fecha_emision < (@hasta::timestamptz + INTERVAL '1 day'))
        AND (
          @q IS NULL
          OR c.numero LIKE @q
          OR cli.nombre LIKE @q
          OR cad.nombre LIKE @q
          OR cli.email LIKE @q
          OR cad.email LIKE @q
        )
    `;
    const statsResult = await statsReq.query<{
      cantidad: number;
      tarifa_total: number;
      comision_total: number;
      pago_cadetes: number;
    }>(`
      SELECT COUNT(*) AS cantidad,
             COALESCE(SUM(c.tarifa_total), 0) AS tarifa_total,
             COALESCE(SUM(c.comision_monto), 0) AS comision_total,
             COALESCE(SUM(c.pago_cadete), 0) AS pago_cadetes
      FROM comprobantes c
      INNER JOIN viajes v ON v.id = c.viaje_id
      INNER JOIN usuarios cli ON cli.id = v.cliente_id
      LEFT JOIN usuarios cad ON cad.id = v.cadete_id
      ${statsWhere}
    `);

    const st = statsResult.recordset[0];
    return {
      items: result.recordset.map(mapComprobante),
      total: Number(result.recordset[0]?.total ?? 0),
      page,
      pageSize,
      stats: {
        cantidad: Number(st?.cantidad ?? 0),
        tarifa_total: Number(st?.tarifa_total ?? 0),
        comision_total: Number(st?.comision_total ?? 0),
        pago_cadetes: Number(st?.pago_cadetes ?? 0),
      },
    };
  }

  async listarPorUsuario(usuarioId: string): Promise<Comprobante[]> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .query<ComprobanteRow>(`
        SELECT *
        FROM comprobantes
        WHERE usuario_id = @uid
        ORDER BY fecha_emision DESC
        LIMIT 50
      `);
    return result.recordset.map(mapComprobante);
  }

  async listarPorViaje(viajeId: string): Promise<Comprobante[]> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('vid', sql.UniqueIdentifier, viajeId)
      .query<ComprobanteRow>(`
        SELECT * FROM comprobantes WHERE viaje_id = @vid ORDER BY rol_destino
      `);
    return result.recordset.map(mapComprobante);
  }

  async getById(id: string, usuarioId?: string): Promise<Comprobante> {
    const pool = await getPool();
    const req = pool.request().input('id', sql.UniqueIdentifier, id);
    let where = 'id = @id';
    if (usuarioId) {
      req.input('uid', sql.UniqueIdentifier, usuarioId);
      where += ' AND usuario_id = @uid';
    }
    const result = await req.query<ComprobanteRow>(`
      SELECT * FROM comprobantes WHERE ${where}
    `);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError('Comprobante no encontrado');
    return mapComprobante(row);
  }

  async existenParaViaje(viajeId: string): Promise<boolean> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('vid', sql.UniqueIdentifier, viajeId)
      .query<{ n: number }>(`
        SELECT COUNT(*) AS n FROM comprobantes WHERE viaje_id = @vid
      `);
    return Number(result.recordset[0]?.n ?? 0) >= 2;
  }

  async nextNumero(tx: SqlTransaction): Promise<string> {
    const req = new sql.Request(tx);
    const result = await req.query<{ ultimo: number }>(`
      UPDATE comprobante_seq
      SET ultimo = ultimo + 1
      WHERE id = 1
      RETURNING ultimo
    `);
    const n = Number(result.recordset[0]?.ultimo ?? 1);
    return `SD-${String(n).padStart(6, '0')}`;
  }

  async insert(
    tx: SqlTransaction,
    input: {
      numero: string;
      viaje_id: string;
      usuario_id: string;
      rol_destino: 'cliente' | 'cadete';
      tarifa_total: number;
      comision_pct: number;
      comision_monto: number;
      pago_cadete: number;
      monto_usuario: number;
      metodo_pago: string;
      tipo_servicio: string;
      detalle: Record<string, unknown>;
    },
  ): Promise<void> {
    const req = new sql.Request(tx);
    await req
      .input('numero', sql.NVarChar(20), input.numero)
      .input('viaje', sql.UniqueIdentifier, input.viaje_id)
      .input('uid', sql.UniqueIdentifier, input.usuario_id)
      .input('rol', sql.NVarChar(20), input.rol_destino)
      .input('tarifa', sql.Decimal(12, 2), input.tarifa_total)
      .input('pct', sql.Decimal(5, 2), input.comision_pct)
      .input('comision', sql.Decimal(12, 2), input.comision_monto)
      .input('pago', sql.Decimal(12, 2), input.pago_cadete)
      .input('monto', sql.Decimal(12, 2), input.monto_usuario)
      .input('metodo', sql.NVarChar(20), input.metodo_pago)
      .input('tipo', sql.NVarChar(20), input.tipo_servicio)
      .input('detalle', sql.NVarChar(sql.MAX), JSON.stringify(input.detalle))
      .query(`
        INSERT INTO comprobantes (
          numero, viaje_id, usuario_id, rol_destino,
          tarifa_total, comision_pct, comision_monto, pago_cadete, monto_usuario,
          metodo_pago, tipo_servicio, detalle_json
        ) VALUES (
          @numero, @viaje, @uid, @rol,
          @tarifa, @pct, @comision, @pago, @monto,
          @metodo, @tipo, @detalle::jsonb
        )
      `);
  }
}

export const comisionModel = new ComisionModel();
export const comprobanteModel = new ComprobanteModel();

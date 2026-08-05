import { getPool, sql } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export type Liquidacion = {
  id: string;
  viaje_id: string;
  cadete_id: string;
  cliente_id: string;
  tarifa_cliente: number;
  comision_retenida: number;
  comision_pct: number;
  monto_a_transferir: number;
  metodo_pago_cliente: string;
  cbu_destino: string | null;
  alias_destino: string | null;
  banco_destino: string | null;
  titular_destino: string | null;
  plazo_dias: number;
  fecha_limite: string;
  estado: string;
  fecha_transferencia: string | null;
  fecha_creacion: string;
  cadete_nombre?: string;
  cliente_nombre?: string;
};

async function plazoDias(): Promise<number> {
  try {
    const pool = await getPool();
    const r = await pool.request().query<{ valor: string }>(`
      SELECT valor FROM dbo.configuraciones WHERE clave = N'liquidacion.plazo_dias'
    `);
    const parsed = JSON.parse(r.recordset[0]?.valor ?? '{"dias":7}') as { dias?: number };
    return Math.min(Math.max(Number(parsed.dias ?? 7), 1), 60);
  } catch {
    return 7;
  }
}

export class LiquidacionModel {
  async crearDesdeViaje(input: {
    viaje_id: string;
    cadete_id: string;
    cliente_id: string;
    comprobante_id?: string | null;
    tarifa_cliente: number;
    comision_retenida: number;
    comision_pct: number;
    monto_a_transferir: number;
    metodo_pago_cliente: string;
    cbu_destino: string | null;
    alias_destino: string | null;
    banco_destino: string | null;
    titular_destino: string | null;
  }): Promise<void> {
    const dias = await plazoDias();
    const pool = await getPool();
    await pool
      .request()
      .input('viaje', sql.UniqueIdentifier, input.viaje_id)
      .input('cadete', sql.UniqueIdentifier, input.cadete_id)
      .input('cliente', sql.UniqueIdentifier, input.cliente_id)
      .input('comp', sql.UniqueIdentifier, input.comprobante_id ?? null)
      .input('tarifa', sql.Decimal(12, 2), input.tarifa_cliente)
      .input('comision', sql.Decimal(12, 2), input.comision_retenida)
      .input('pct', sql.Decimal(5, 2), input.comision_pct)
      .input('monto', sql.Decimal(12, 2), input.monto_a_transferir)
      .input('metodo', sql.NVarChar(20), input.metodo_pago_cliente)
      .input('cbu', sql.NVarChar(22), input.cbu_destino)
      .input('alias', sql.NVarChar(80), input.alias_destino)
      .input('banco', sql.NVarChar(80), input.banco_destino)
      .input('titular', sql.NVarChar(150), input.titular_destino)
      .input('plazo', sql.Int, dias)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.liquidaciones WHERE viaje_id = @viaje)
        INSERT INTO dbo.liquidaciones (
          viaje_id, cadete_id, cliente_id, comprobante_id,
          tarifa_cliente, comision_retenida, comision_pct, monto_a_transferir,
          metodo_pago_cliente, cbu_destino, alias_destino, banco_destino, titular_destino,
          plazo_dias, fecha_limite, estado
        ) VALUES (
          @viaje, @cadete, @cliente, @comp,
          @tarifa, @comision, @pct, @monto,
          @metodo, @cbu, @alias, @banco, @titular,
          @plazo, DATEADD(day, @plazo, SYSDATETIMEOFFSET()), N'pendiente'
        )
      `);
  }

  async listar(filtros: { estado?: string; cadete_id?: string } = {}) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('estado', sql.NVarChar(20), filtros.estado ?? null)
      .input('cadete', sql.UniqueIdentifier, filtros.cadete_id ?? null)
      .query<{
        id: string;
        viaje_id: string;
        cadete_id: string;
        cliente_id: string;
        tarifa_cliente: number;
        comision_retenida: number;
        comision_pct: number;
        monto_a_transferir: number;
        metodo_pago_cliente: string;
        cbu_destino: string | null;
        alias_destino: string | null;
        banco_destino: string | null;
        titular_destino: string | null;
        plazo_dias: number;
        fecha_limite: Date;
        estado: string;
        fecha_transferencia: Date | null;
        fecha_creacion: Date;
        cadete_nombre: string;
        cliente_nombre: string;
      }>(`
        SELECT TOP 100
               l.*,
               cad.nombre AS cadete_nombre,
               cli.nombre AS cliente_nombre
        FROM dbo.liquidaciones l
        INNER JOIN dbo.usuarios cad ON cad.id = l.cadete_id
        INNER JOIN dbo.usuarios cli ON cli.id = l.cliente_id
        WHERE (@estado IS NULL OR l.estado = @estado)
          AND (@cadete IS NULL OR l.cadete_id = @cadete)
        ORDER BY l.fecha_limite ASC, l.fecha_creacion DESC
      `);

    return result.recordset.map(
      (r): Liquidacion => ({
        id: String(r.id),
        viaje_id: String(r.viaje_id),
        cadete_id: String(r.cadete_id),
        cliente_id: String(r.cliente_id),
        tarifa_cliente: Number(r.tarifa_cliente),
        comision_retenida: Number(r.comision_retenida),
        comision_pct: Number(r.comision_pct),
        monto_a_transferir: Number(r.monto_a_transferir),
        metodo_pago_cliente: r.metodo_pago_cliente,
        cbu_destino: r.cbu_destino,
        alias_destino: r.alias_destino,
        banco_destino: r.banco_destino,
        titular_destino: r.titular_destino,
        plazo_dias: Number(r.plazo_dias),
        fecha_limite: new Date(r.fecha_limite).toISOString(),
        estado: r.estado,
        fecha_transferencia: r.fecha_transferencia
          ? new Date(r.fecha_transferencia).toISOString()
          : null,
        fecha_creacion: new Date(r.fecha_creacion).toISOString(),
        cadete_nombre: r.cadete_nombre,
        cliente_nombre: r.cliente_nombre,
      }),
    );
  }

  async marcarTransferida(id: string, nota?: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('nota', sql.NVarChar(500), nota ?? null)
      .query(`
        UPDATE dbo.liquidaciones
        SET estado = N'transferida',
            fecha_transferencia = SYSDATETIMEOFFSET(),
            nota = COALESCE(@nota, nota)
        WHERE id = @id;
        SELECT @@ROWCOUNT AS n;
      `);
    if (!Number(result.recordset[0]?.n)) throw new NotFoundError('Liquidación no encontrada');
    const items = await this.listar({});
    const found = items.find((x) => x.id === id);
    if (!found) throw new NotFoundError('Liquidación no encontrada');
    return found;
  }

  async getPlazo() {
    return { dias: await plazoDias() };
  }

  async setPlazo(dias: number) {
    if (dias < 1 || dias > 60) throw new ValidationError('Plazo entre 1 y 60 días');
    const pool = await getPool();
    await pool
      .request()
      .input('valor', sql.NVarChar(sql.MAX), JSON.stringify({ dias }))
      .query(`
        UPDATE dbo.configuraciones
        SET valor = @valor
        WHERE clave = N'liquidacion.plazo_dias'
      `);
    return { dias };
  }
}

export const liquidacionModel = new LiquidacionModel();

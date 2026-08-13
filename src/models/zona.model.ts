import { getPool, sql } from '../config/database.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { rethrowSqlConflict } from '../utils/sql-conflicts.js';

export type ZonaHex = {
  id: string;
  h3_index: string;
  tipo: string;
  lat_centro: number;
  lng_centro: number;
  tarifa_multiplier: number;
  demanda_actual: number;
  activa: boolean;
  nombre: string | null;
};

type ZonaRow = {
  id: string;
  h3_index: string;
  tipo: string;
  lat_centro: number;
  lng_centro: number;
  tarifa_multiplier: number;
  demanda_actual: number;
  activa: boolean;
  nombre: string | null;
};

function mapZona(row: ZonaRow): ZonaHex {
  return {
    id: String(row.id),
    h3_index: row.h3_index,
    tipo: row.tipo,
    lat_centro: Number(row.lat_centro),
    lng_centro: Number(row.lng_centro),
    tarifa_multiplier: Number(row.tarifa_multiplier),
    demanda_actual: Number(row.demanda_actual),
    activa: Boolean(row.activa),
    nombre: row.nombre,
  };
}

const TIPOS = new Set([
  'residencial',
  'comercial',
  'industrial',
  'aeropuerto',
  'centro',
  'periferia',
  'restringida',
]);

export class ZonaModel {
  async listar(incluirInactivas = true) {
    const pool = await getPool();
    const result = await pool.request().query<ZonaRow>(`
      SELECT id, h3_index, tipo, lat_centro, lng_centro, tarifa_multiplier,
             demanda_actual, activa, nombre
      FROM zonas_hexagonos
      ${incluirInactivas ? '' : 'WHERE activa = TRUE'}
      ORDER BY nombre NULLS LAST, h3_index
    `);
    return result.recordset.map(mapZona);
  }

  async getById(id: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<ZonaRow>(`
        SELECT id, h3_index, tipo, lat_centro, lng_centro, tarifa_multiplier,
               demanda_actual, activa, nombre
        FROM zonas_hexagonos WHERE id = @id
      `);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError('Zona no encontrada');
    return mapZona(row);
  }

  async crear(input: {
    h3_index: string;
    nombre?: string | null;
    tipo?: string;
    lat_centro: number;
    lng_centro: number;
    tarifa_multiplier?: number;
    activa?: boolean;
  }) {
    if (!TIPOS.has(input.tipo ?? 'residencial')) {
      throw new ValidationError('Tipo de zona inválido');
    }
    const pool = await getPool();
    try {
      const result = await pool
        .request()
        .input('h3', sql.NVarChar(64), input.h3_index.trim())
        .input('nombre', sql.NVarChar(100), input.nombre?.trim() || null)
        .input('tipo', sql.NVarChar(20), input.tipo ?? 'residencial')
        .input('lat', sql.Float, input.lat_centro)
        .input('lng', sql.Float, input.lng_centro)
        .input('mult', sql.Decimal(5, 2), input.tarifa_multiplier ?? 1)
        .input('activa', sql.Bit, input.activa === false ? false : true)
        .query<{ id: string }>(`
          INSERT INTO zonas_hexagonos
            (h3_index, nombre, tipo, lat_centro, lng_centro, tarifa_multiplier, activa)
          VALUES (@h3, @nombre, @tipo, @lat, @lng, @mult, @activa)
          RETURNING id
        `);
      return this.getById(result.recordset[0]!.id);
    } catch (e) {
      rethrowSqlConflict(e);
    }
  }

  async actualizar(
    id: string,
    input: {
      h3_index?: string;
      nombre?: string | null;
      tipo?: string;
      lat_centro?: number;
      lng_centro?: number;
      tarifa_multiplier?: number;
      activa?: boolean;
    },
  ) {
    const actual = await this.getById(id);
    if (input.tipo && !TIPOS.has(input.tipo)) {
      throw new ValidationError('Tipo de zona inválido');
    }
    const pool = await getPool();
    try {
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .input('h3', sql.NVarChar(64), input.h3_index?.trim() ?? actual.h3_index)
        .input(
          'nombre',
          sql.NVarChar(100),
          input.nombre !== undefined ? input.nombre?.trim() || null : actual.nombre,
        )
        .input('tipo', sql.NVarChar(20), input.tipo ?? actual.tipo)
        .input('lat', sql.Float, input.lat_centro ?? actual.lat_centro)
        .input('lng', sql.Float, input.lng_centro ?? actual.lng_centro)
        .input(
          'mult',
          sql.Decimal(5, 2),
          input.tarifa_multiplier ?? actual.tarifa_multiplier,
        )
        .input(
          'activa',
          sql.Bit,
          input.activa !== undefined ? input.activa : actual.activa,
        )
        .query(`
          UPDATE zonas_hexagonos
          SET h3_index = @h3,
              nombre = @nombre,
              tipo = @tipo,
              lat_centro = @lat,
              lng_centro = @lng,
              tarifa_multiplier = @mult,
              activa = @activa,
              fecha_actualizacion = NOW()
          WHERE id = @id
        `);
      return this.getById(id);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictError('Ya existe una zona con ese índice H3');
      }
      throw e;
    }
  }

  /** Baja lógica: activa = false */
  async darDeBaja(id: string) {
    return this.actualizar(id, { activa: false });
  }
}

export const zonaModel = new ZonaModel();

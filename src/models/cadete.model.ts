import { getPool, sql } from '../config/database.js';
import type {
  Cadete,
  Coordenada,
  DatosMoto,
  DisponibilidadCadete,
  FotosDocumentos,
  PlanCadete,
} from '../types/domain.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { rethrowSqlConflict } from '../utils/sql-conflicts.js';
import bcrypt from 'bcryptjs';
import { cadeteActividadModel } from './cadete_actividad.model.js';

interface CadeteRow {
  usuario_id: string;
  numero_usuario: number;
  dni: string;
  licencia: string;
  patente: string;
  marca_moto: string | null;
  fecha_nacimiento: Date;
  estado_verificacion: string;
  disponibilidad: string;
  lat: number | null;
  lng: number | null;
  ubicacion_actualizada_en: Date | null;
  zona_actual: string | null;
  plan_suscripcion: PlanCadete;
  estado_suscripcion: string;
  comision_actual: number;
  total_viajes: number;
  total_ganado: number;
  calificacion_promedio: number;
  datos_moto: string;
  fotos_documentos: string;
  direccion?: string | null;
  calle?: string | null;
  numero?: string | null;
  piso_dpto?: string | null;
  barrio?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  cbu?: string | null;
  alias_bancario?: string | null;
  banco?: string | null;
  titular_cuenta?: string | null;
  email?: string;
  telefono?: string;
  nombre?: string;
  estado?: string;
}

function mapCadete(row: CadeteRow): Cadete & {
  email?: string;
  telefono?: string;
  nombre?: string;
  estado?: string;
} {
  let ubicacion_actual: Coordenada | null = null;
  if (row.lat != null && row.lng != null) {
    ubicacion_actual = { lat: Number(row.lat), lng: Number(row.lng) };
  }

  let datos_moto: DatosMoto = {};
  let fotos_documentos: FotosDocumentos = {};
  try {
    datos_moto = JSON.parse(row.datos_moto) as DatosMoto;
  } catch {
    /* empty */
  }
  try {
    fotos_documentos = JSON.parse(row.fotos_documentos) as FotosDocumentos;
  } catch {
    /* empty */
  }

  // Preferir columnas normalizadas; JSON como respaldo de extras
  if (row.patente) datos_moto.patente = row.patente;
  if (row.marca_moto) datos_moto.marca = row.marca_moto;

  return {
    usuario_id: String(row.usuario_id),
    numero_usuario: Number(row.numero_usuario),
    dni: row.dni,
    licencia: row.licencia,
    patente: row.patente,
    marca_moto: row.marca_moto,
    fecha_nacimiento: new Date(row.fecha_nacimiento).toISOString().slice(0, 10),
    estado_verificacion: row.estado_verificacion as Cadete['estado_verificacion'],
    disponibilidad: row.disponibilidad as DisponibilidadCadete,
    ubicacion_actual,
    ubicacion_actualizada_en: row.ubicacion_actualizada_en
      ? new Date(row.ubicacion_actualizada_en).toISOString()
      : null,
    zona_actual: row.zona_actual,
    plan_suscripcion: row.plan_suscripcion,
    estado_suscripcion: row.estado_suscripcion as Cadete['estado_suscripcion'],
    comision_actual: Number(row.comision_actual),
    total_viajes: row.total_viajes,
    total_ganado: Number(row.total_ganado),
    calificacion_promedio: Number(row.calificacion_promedio),
    datos_moto,
    fotos_documentos,
    direccion: row.direccion ?? null,
    calle: row.calle ?? null,
    numero: row.numero ?? null,
    piso_dpto: row.piso_dpto ?? null,
    barrio: row.barrio ?? null,
    ciudad: row.ciudad ?? null,
    provincia: row.provincia ?? null,
    cbu: row.cbu ?? null,
    alias_bancario: row.alias_bancario ?? null,
    banco: row.banco ?? null,
    titular_cuenta: row.titular_cuenta ?? null,
    email: row.email,
    telefono: row.telefono,
    nombre: row.nombre,
    estado: row.estado,
  };
}

const SELECT_CADETE = `
  SELECT c.usuario_id, c.dni, c.licencia, c.patente, c.marca_moto, c.fecha_nacimiento,
         c.estado_verificacion, c.disponibilidad,
         c.ubicacion_actual.Lat AS lat, c.ubicacion_actual.Long AS lng,
         c.ubicacion_actualizada_en, c.zona_actual, c.plan_suscripcion, c.estado_suscripcion,
         c.comision_actual, c.total_viajes, c.total_ganado, c.calificacion_promedio,
         c.datos_moto, c.fotos_documentos, c.direccion,
         c.calle, c.numero, c.piso_dpto, c.barrio, c.ciudad, c.provincia,
         c.cbu, c.alias_bancario, c.banco, c.titular_cuenta,
         u.numero_usuario, u.email, u.telefono, u.nombre, u.estado
  FROM dbo.cadetes c
  INNER JOIN dbo.usuarios u ON u.id = c.usuario_id
`;

export class CadeteModel {
  async getById(usuarioId: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<CadeteRow>(`${SELECT_CADETE} WHERE c.usuario_id = @id`);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError('Cadete no encontrado');
    return mapCadete(row);
  }

  async assertUnicosCadete(input: {
    email: string;
    telefono: string;
    dni: string;
    licencia: string;
    patente: string;
  }) {
    const pool = await getPool();
    const checks = await pool
      .request()
      .input('email', sql.NVarChar(255), input.email)
      .input('telefono', sql.NVarChar(20), input.telefono)
      .input('dni', sql.NVarChar(20), input.dni)
      .input('licencia', sql.NVarChar(50), input.licencia)
      .input('patente', sql.NVarChar(20), input.patente)
      .query<{ campo: string }>(`
        SELECT N'email' AS campo FROM dbo.usuarios WHERE email = @email
        UNION ALL
        SELECT N'telefono' FROM dbo.usuarios WHERE telefono = @telefono
        UNION ALL
        SELECT N'dni' FROM dbo.cadetes WHERE dni = @dni
        UNION ALL
        SELECT N'licencia' FROM dbo.cadetes WHERE licencia = @licencia
        UNION ALL
        SELECT N'patente' FROM dbo.cadetes WHERE patente = @patente
      `);

    for (const row of checks.recordset) {
      if (row.campo === 'email') throw new ConflictError('El email ya está registrado');
      if (row.campo === 'telefono') throw new ConflictError('El teléfono ya está registrado');
      if (row.campo === 'dni') throw new ConflictError('El DNI del cadete ya está registrado');
      if (row.campo === 'licencia') {
        throw new ConflictError('El carnet de conducir ya está registrado');
      }
      if (row.campo === 'patente') throw new ConflictError('La patente ya está registrada');
    }
  }

  async registrar(input: {
    email: string;
    telefono: string;
    nombre: string;
    password: string;
    dni: string;
    licencia: string;
    fecha_nacimiento: string;
    patente: string;
    marca_moto?: string;
    direccion?: string;
    calle?: string;
    numero?: string;
    piso_dpto?: string | null;
    barrio?: string;
    ciudad?: string;
    provincia?: string;
    zona_h3?: string | null;
    datos_moto: DatosMoto;
    fotos_documentos: FotosDocumentos;
  }) {
    const dni = input.dni.trim();
    const licencia = input.licencia.trim();
    const patente = (
      input.patente ||
      input.datos_moto.patente ||
      ''
    )
      .trim()
      .toUpperCase();
    if (!patente) throw new ValidationError('La patente es obligatoria');
    const direccion = (input.direccion ?? '').trim() || null;
    const calle = (input.calle ?? '').trim() || null;
    const numero = (input.numero ?? '').trim() || null;
    const piso_dpto = (input.piso_dpto ?? '').trim() || null;
    const barrio = (input.barrio ?? '').trim() || null;
    const ciudad = (input.ciudad ?? 'Salta').trim() || 'Salta';
    const provincia = (input.provincia ?? 'Salta').trim() || 'Salta';
    const zona_h3 = input.zona_h3 ?? null;

    await this.assertUnicosCadete({
      email: input.email,
      telefono: input.telefono,
      dni,
      licencia,
      patente,
    });

    const marca = (input.marca_moto || input.datos_moto.marca || '').trim() || null;
    const datos_moto: DatosMoto = {
      ...input.datos_moto,
      marca: marca ?? undefined,
      patente,
    };

    const password_hash = await bcrypt.hash(input.password, 10);
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const ins = await new sql.Request(tx)
        .input('email', sql.NVarChar(255), input.email)
        .input('telefono', sql.NVarChar(20), input.telefono)
        .input('nombre', sql.NVarChar(150), input.nombre)
        .input('password_hash', sql.NVarChar(255), password_hash)
        .query<{ id: string }>(`
          INSERT INTO dbo.usuarios (email, telefono, nombre, password_hash, rol, estado)
          OUTPUT INSERTED.id
          VALUES (@email, @telefono, @nombre, @password_hash, N'cadete', N'pendiente_verificacion')
        `);
      const id = ins.recordset[0]?.id;
      if (!id) throw new Error('No se creó usuario');

      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, id)
        .input('dni', sql.NVarChar(20), dni)
        .input('licencia', sql.NVarChar(50), licencia)
        .input('patente', sql.NVarChar(20), patente)
        .input('marca', sql.NVarChar(50), marca)
        .input('fn', sql.Date, input.fecha_nacimiento)
        .input('dir', sql.NVarChar(300), direccion)
        .input('calle', sql.NVarChar(150), calle)
        .input('numero', sql.NVarChar(20), numero)
        .input('piso', sql.NVarChar(40), piso_dpto)
        .input('barrio', sql.NVarChar(100), barrio)
        .input('ciudad', sql.NVarChar(100), ciudad)
        .input('provincia', sql.NVarChar(100), provincia)
        .input('zona', sql.NVarChar(64), zona_h3)
        .input('moto', sql.NVarChar(sql.MAX), JSON.stringify(datos_moto))
        .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(input.fotos_documentos))
        .query(`
          INSERT INTO dbo.cadetes (
            usuario_id, dni, licencia, patente, marca_moto, fecha_nacimiento,
            direccion, calle, numero, piso_dpto, barrio, ciudad, provincia, zona_actual,
            estado_verificacion, datos_moto, fotos_documentos
          ) VALUES (
            @id, @dni, @licencia, @patente, @marca, @fn,
            @dir, @calle, @numero, @piso, @barrio, @ciudad, @provincia, @zona,
            N'pendiente', @moto, @fotos
          )
        `);

      await tx.commit();
      return this.getById(id);
    } catch (e) {
      await tx.rollback();
      rethrowSqlConflict(e);
    }
  }

  async mergeFotosDocumentos(usuarioId: string, patch: Partial<FotosDocumentos> | Record<string, string>) {
    const actual = await this.getById(usuarioId);
    const merged = { ...actual.fotos_documentos, ...patch };
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(merged))
      .query(`UPDATE dbo.cadetes SET fotos_documentos = @fotos WHERE usuario_id = @id`);
    return this.getById(usuarioId);
  }

  async setDireccion(usuarioId: string, direccion: string | null) {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('dir', sql.NVarChar(300), direccion)
      .query(`UPDATE dbo.cadetes SET direccion = @dir WHERE usuario_id = @id`);
    return this.getById(usuarioId);
  }

  async setDisponibilidad(usuarioId: string, disponibilidad: DisponibilidadCadete) {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('d', sql.NVarChar(20), disponibilidad)
      .query(`UPDATE dbo.cadetes SET disponibilidad = @d WHERE usuario_id = @id`);
    await cadeteActividadModel.registrarCambioDisponibilidad(usuarioId, disponibilidad);
    return this.getById(usuarioId);
  }

  async actualizarUbicacion(
    usuarioId: string,
    lat: number,
    lng: number,
    zona_h3?: string,
  ) {
    const zonaRes = await cadeteActividadModel.actualizarZonaEnSesion(usuarioId, lat, lng);
    const zonaFinal = zona_h3 ?? zonaRes.zona_h3;

    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('lat', sql.Float, lat)
      .input('lng', sql.Float, lng)
      .input('zona', sql.NVarChar(64), zonaFinal)
      .query(`
        UPDATE dbo.cadetes
        SET ubicacion_actual = geography::Point(@lat, @lng, 4326),
            ubicacion_actualizada_en = SYSDATETIMEOFFSET(),
            zona_actual = COALESCE(@zona, zona_actual)
        WHERE usuario_id = @id
      `);

    return this.getById(usuarioId);
  }

  async listarDisponiblesCercanos() {
    const pool = await getPool();
    const result = await pool.request().query<CadeteRow>(`
      ${SELECT_CADETE}
      WHERE c.disponibilidad = N'online'
        AND c.estado_verificacion = N'aprobado'
        AND u.estado = N'activo'
        AND c.ubicacion_actual IS NOT NULL
    `);
    return result.recordset.map(mapCadete);
  }

  async listarAdmin(page = 1, pageSize = 20) {
    const pool = await getPool();
    const offset = (page - 1) * pageSize;
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, pageSize)
      .query<CadeteRow & { total: number }>(`
        SELECT COUNT(*) OVER() AS total,
               c.usuario_id, c.dni, c.licencia, c.patente, c.marca_moto, c.fecha_nacimiento,
               c.estado_verificacion, c.disponibilidad,
               c.ubicacion_actual.Lat AS lat, c.ubicacion_actual.Long AS lng,
               c.ubicacion_actualizada_en, c.zona_actual, c.plan_suscripcion, c.estado_suscripcion,
               c.comision_actual, c.total_viajes, c.total_ganado, c.calificacion_promedio,
               c.datos_moto, c.fotos_documentos, c.direccion,
               c.calle, c.numero, c.piso_dpto, c.barrio, c.ciudad, c.provincia,
               c.cbu, c.alias_bancario, c.banco, c.titular_cuenta,
               u.numero_usuario, u.email, u.telefono, u.nombre, u.estado
        FROM dbo.cadetes c
        INNER JOIN dbo.usuarios u ON u.id = c.usuario_id
        ORDER BY u.numero_usuario DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    return {
      items: result.recordset.map(mapCadete),
      total: Number(result.recordset[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async setVerificacion(
    usuarioId: string,
    estado: 'aprobado' | 'rechazado' | 'suspendido' | 'en_revision',
  ) {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('e', sql.NVarChar(20), estado)
      .query(`
        UPDATE dbo.cadetes SET estado_verificacion = @e WHERE usuario_id = @id;
        UPDATE dbo.usuarios
        SET estado = CASE
          WHEN @e = N'aprobado' THEN N'activo'
          WHEN @e = N'suspendido' THEN N'suspendido'
          ELSE estado END
        WHERE id = @id;
      `);
    return this.getById(usuarioId);
  }

  async actualizarPlan(usuarioId: string, plan: PlanCadete) {
    const comision: Record<PlanCadete, number> = {
      trial: 15,
      silver: 13,
      gold: 10,
      premium: 8,
    };
    const monto: Record<PlanCadete, number> = {
      trial: 0,
      silver: 6000,
      gold: 10000,
      premium: 15000,
    };
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('plan', sql.NVarChar(20), plan)
      .input('com', sql.Decimal(5, 2), comision[plan])
      .query(`
        UPDATE dbo.cadetes
        SET plan_suscripcion = @plan,
            comision_actual = @com,
            estado_suscripcion = CASE WHEN @plan = N'trial' THEN N'trial' ELSE N'activa' END,
            fecha_inicio_suscripcion = SYSDATETIMEOFFSET(),
            fecha_fin_suscripcion = DATEADD(month, 1, SYSDATETIMEOFFSET())
        WHERE usuario_id = @id
      `);

    await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .input('plan', sql.NVarChar(20), plan)
      .input('monto', sql.Decimal(12, 2), monto[plan])
      .input('com', sql.Decimal(5, 2), comision[plan])
      .query(`
        INSERT INTO dbo.suscripciones (usuario_id, tipo_usuario, plan, estado, fecha_inicio, fecha_fin, monto_mensual, beneficios)
        VALUES (
          @uid, N'cadete', @plan,
          CASE WHEN @plan = N'trial' THEN N'trial' ELSE N'activa' END,
          SYSDATETIMEOFFSET(), DATEADD(month, 1, SYSDATETIMEOFFSET()),
          @monto, CONCAT(N'{"comision_pct":', @com, N'}')
        )
      `);

    return this.getById(usuarioId);
  }

  async ganancias(usuarioId: string) {
    const cadete = await this.getById(usuarioId);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<{ mes: string; total: number; viajes: number }>(`
        SELECT FORMAT(fecha_fin, 'yyyy-MM') AS mes,
               SUM(ISNULL(pago_cadete, 0)) AS total,
               COUNT(*) AS viajes
        FROM dbo.viajes
        WHERE cadete_id = @id AND estado = N'finalizado'
        GROUP BY FORMAT(fecha_fin, 'yyyy-MM')
        ORDER BY mes DESC
      `);
    return {
      total_ganado: cadete.total_ganado,
      total_viajes: cadete.total_viajes,
      comision_actual: cadete.comision_actual,
      por_mes: result.recordset.map((r) => ({
        mes: r.mes,
        total: Number(r.total),
        viajes: Number(r.viajes),
      })),
    };
  }

  async actualizarDatosCobro(
    usuarioId: string,
    input: {
      cbu?: string;
      alias_bancario?: string;
      banco?: string;
      titular_cuenta?: string;
    },
  ) {
    const cbu = input.cbu?.replace(/\s+/g, '') ?? null;
    if (cbu && !/^\d{22}$/.test(cbu)) {
      throw new ValidationError('CBU inválido (deben ser 22 dígitos)');
    }
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('cbu', sql.NVarChar(22), cbu)
      .input('alias', sql.NVarChar(80), input.alias_bancario?.trim() || null)
      .input('banco', sql.NVarChar(80), input.banco?.trim() || null)
      .input('titular', sql.NVarChar(150), input.titular_cuenta?.trim() || null)
      .query(`
        UPDATE dbo.cadetes
        SET cbu = COALESCE(@cbu, cbu),
            alias_bancario = COALESCE(@alias, alias_bancario),
            banco = COALESCE(@banco, banco),
            titular_cuenta = COALESCE(@titular, titular_cuenta)
        WHERE usuario_id = @id
      `);
    return this.getById(usuarioId);
  }

  async detalleAdmin(usuarioId: string) {
    const cadete = await this.getById(usuarioId);
    const pool = await getPool();
    const ret = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<{
        viajes: number;
        tarifa_bruta: number;
        comision_retenida: number;
        neto_cadete: number;
      }>(`
        SELECT COUNT(*) AS viajes,
               ISNULL(SUM(tarifa_final),0) AS tarifa_bruta,
               ISNULL(SUM(comision_plataforma),0) AS comision_retenida,
               ISNULL(SUM(pago_cadete),0) AS neto_cadete
        FROM dbo.viajes
        WHERE cadete_id = @id AND estado = N'finalizado'
      `);
    const liq = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<{
        pendientes: number;
        monto_pendiente: number;
        transferidas: number;
        monto_transferido: number;
      }>(`
        SELECT
          SUM(CASE WHEN estado = N'pendiente' THEN 1 ELSE 0 END) AS pendientes,
          SUM(CASE WHEN estado = N'pendiente' THEN monto_a_transferir ELSE 0 END) AS monto_pendiente,
          SUM(CASE WHEN estado = N'transferida' THEN 1 ELSE 0 END) AS transferidas,
          SUM(CASE WHEN estado = N'transferida' THEN monto_a_transferir ELSE 0 END) AS monto_transferido
        FROM dbo.liquidaciones
        WHERE cadete_id = @id
      `);
    const r = ret.recordset[0];
    const l = liq.recordset[0];
    return {
      cadete,
      stats: {
        viajes: Number(r?.viajes ?? 0),
        tarifa_bruta: Number(r?.tarifa_bruta ?? 0),
        comision_retenida: Number(r?.comision_retenida ?? 0),
        neto_cadete: Number(r?.neto_cadete ?? 0),
        liquidaciones_pendientes: Number(l?.pendientes ?? 0),
        monto_pendiente: Number(l?.monto_pendiente ?? 0),
        liquidaciones_transferidas: Number(l?.transferidas ?? 0),
        monto_transferido: Number(l?.monto_transferido ?? 0),
      },
    };
  }
}

export const cadeteModel = new CadeteModel();

import { getPool, sql } from '../config/database.js';
import type {
  Cliente,
  DireccionFavorita,
  MetodoPago,
  PlanCliente,
} from '../types/domain.js';
import { NotFoundError } from '../utils/errors.js';
import { parseJsonField } from '../utils/json-field.js';

interface ClienteRow {
  usuario_id: string;
  numero_usuario: number;
  dni: string;
  plan_suscripcion: PlanCliente;
  tipo_cuenta?: string;
  tiempo_preparacion_min?: number;
  horario_comercial?: string | null;
  estado_suscripcion: string;
  fecha_inicio_suscripcion: Date | null;
  fecha_fin_suscripcion: Date | null;
  direccion?: string | null;
  calle?: string | null;
  numero?: string | null;
  piso_dpto?: string | null;
  barrio?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  zona_h3?: string | null;
  zona_nombre?: string | null;
  direcciones_favoritas: string;
  fotos_documentos?: string | null;
  metodo_pago_preferido: MetodoPago;
  viajes_realizados: number;
  calificacion_promedio: number;
  puntos_fidelidad: number;
  email: string;
  telefono: string;
  nombre: string;
  estado: string;
}

function mapCliente(row: ClienteRow): Cliente & {
  email: string;
  telefono: string;
  nombre: string;
  estado: string;
} {
  const dirs = parseJsonField<DireccionFavorita[]>(row.direcciones_favoritas, []);
  const fotos = parseJsonField<Cliente['fotos_documentos']>(row.fotos_documentos, {});
  return {
    usuario_id: String(row.usuario_id),
    numero_usuario: Number(row.numero_usuario),
    dni: row.dni,
    plan_suscripcion: row.plan_suscripcion,
    tipo_cuenta: (row.tipo_cuenta as Cliente['tipo_cuenta']) || 'particular',
    tiempo_preparacion_min: Number(row.tiempo_preparacion_min ?? 0),
    horario_comercial: row.horario_comercial
      ? parseJsonField<Cliente['horario_comercial']>(row.horario_comercial, null)
      : null,
    estado_suscripcion: row.estado_suscripcion as Cliente['estado_suscripcion'],
    fecha_inicio_suscripcion: row.fecha_inicio_suscripcion
      ? new Date(row.fecha_inicio_suscripcion).toISOString()
      : null,
    fecha_fin_suscripcion: row.fecha_fin_suscripcion
      ? new Date(row.fecha_fin_suscripcion).toISOString()
      : null,
    direccion: row.direccion ?? null,
    calle: row.calle ?? null,
    numero: row.numero ?? null,
    piso_dpto: row.piso_dpto ?? null,
    barrio: row.barrio ?? null,
    ciudad: row.ciudad ?? null,
    provincia: row.provincia ?? null,
    zona_h3: row.zona_h3 ?? null,
    zona_nombre: row.zona_nombre ?? null,
    direcciones_favoritas: dirs,
    fotos_documentos: fotos,
    metodo_pago_preferido: (row.metodo_pago_preferido ?? 'efectivo') as MetodoPago,
    viajes_realizados: row.viajes_realizados,
    calificacion_promedio: Number(row.calificacion_promedio),
    puntos_fidelidad: row.puntos_fidelidad,
    email: row.email,
    telefono: row.telefono,
    nombre: row.nombre,
    estado: row.estado,
  };
}

export class ClienteModel {
  async getPerfil(usuarioId: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<ClienteRow>(`
        SELECT c.*, u.numero_usuario, u.email, u.telefono, u.nombre, u.estado
        FROM clientes c
        INNER JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.usuario_id = @id
      `);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError('Cliente no encontrado');
    return mapCliente(row);
  }

  async listar(page = 1, pageSize = 20) {
    const pool = await getPool();
    const offset = (page - 1) * pageSize;
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, pageSize)
      .query<ClienteRow & { total: number }>(`
        SELECT c.*, u.numero_usuario, u.email, u.telefono, u.nombre, u.estado,
               COUNT(*) OVER() AS total
        FROM clientes c
        INNER JOIN usuarios u ON u.id = c.usuario_id
        ORDER BY u.numero_usuario DESC
        OFFSET @offset LIMIT @limit
      `);
    const total = result.recordset[0]?.total ?? 0;
    return {
      items: result.recordset.map(mapCliente),
      total: Number(total),
      page,
      pageSize,
    };
  }

  async actualizarPreferencias(
    usuarioId: string,
    input: {
      metodo_pago_preferido?: MetodoPago;
      direcciones_favoritas?: DireccionFavorita[];
    },
  ) {
    const actual = await this.getPerfil(usuarioId);
    const metodo = input.metodo_pago_preferido ?? actual.metodo_pago_preferido;
    const dirs = input.direcciones_favoritas ?? actual.direcciones_favoritas;
    const pool = await getPool();

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('pago', sql.NVarChar(30), metodo)
      .input('dirs', sql.NVarChar(sql.MAX), JSON.stringify(dirs))
      .query(`
        UPDATE clientes
        SET metodo_pago_preferido = @pago,
            direcciones_favoritas = @dirs::jsonb,
            fecha_actualizacion = NOW()
        WHERE usuario_id = @id
      `);

    return this.getPerfil(usuarioId);
  }

  async setIdentidad(
    usuarioId: string,
    input: {
      direccion?: string | null;
      calle?: string | null;
      numero?: string | null;
      piso_dpto?: string | null;
      barrio?: string | null;
      ciudad?: string | null;
      provincia?: string | null;
      zona_h3?: string | null;
      zona_nombre?: string | null;
      zona_lat?: number | null;
      zona_lng?: number | null;
      dni_pdf?: string | null;
    },
  ) {
    const actual = await this.getPerfil(usuarioId);
    const fotos = { ...actual.fotos_documentos };
    if (input.dni_pdf) fotos.dni_pdf = input.dni_pdf;
    const direccion =
      input.direccion !== undefined ? (input.direccion?.trim() || null) : actual.direccion;
    const calle = input.calle !== undefined ? input.calle : actual.calle;
    const numero = input.numero !== undefined ? input.numero : actual.numero;
    const piso_dpto = input.piso_dpto !== undefined ? input.piso_dpto : actual.piso_dpto;
    const barrio = input.barrio !== undefined ? input.barrio : actual.barrio;
    const ciudad = input.ciudad !== undefined ? input.ciudad : actual.ciudad;
    const provincia = input.provincia !== undefined ? input.provincia : actual.provincia;
    const zona_h3 = input.zona_h3 !== undefined ? input.zona_h3 : actual.zona_h3;
    const zona_nombre = input.zona_nombre !== undefined ? input.zona_nombre : actual.zona_nombre;

    let dirs = actual.direcciones_favoritas;
    if (direccion && !dirs.some((d) => d.direccion === direccion)) {
      dirs = [
        {
          alias: 'Principal',
          direccion,
          lat: input.zona_lat ?? -24.7821,
          lng: input.zona_lng ?? -65.4232,
          es_principal: true,
        },
        ...dirs.map((d) => ({ ...d, es_principal: false })),
      ];
    }

    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('dir', sql.NVarChar(300), direccion)
      .input('calle', sql.NVarChar(150), calle)
      .input('numero', sql.NVarChar(20), numero)
      .input('piso', sql.NVarChar(40), piso_dpto)
      .input('barrio', sql.NVarChar(100), barrio)
      .input('ciudad', sql.NVarChar(100), ciudad)
      .input('provincia', sql.NVarChar(100), provincia)
      .input('zona_h3', sql.NVarChar(64), zona_h3)
      .input('zona_nombre', sql.NVarChar(100), zona_nombre)
      .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(fotos))
      .input('dirs', sql.NVarChar(sql.MAX), JSON.stringify(dirs))
      .query(`
        UPDATE clientes
        SET direccion = @dir,
            calle = @calle,
            numero = @numero,
            piso_dpto = @piso,
            barrio = @barrio,
            ciudad = @ciudad,
            provincia = @provincia,
            zona_h3 = @zona_h3,
            zona_nombre = @zona_nombre,
            fotos_documentos = @fotos::jsonb,
            direcciones_favoritas = @dirs::jsonb,
            fecha_actualizacion = NOW()
        WHERE usuario_id = @id
      `);
    return this.getPerfil(usuarioId);
  }

  async setTipoCuenta(
    usuarioId: string,
    input: {
      tipo_cuenta: 'particular' | 'restaurante' | 'comercio';
      tiempo_preparacion_min?: number;
      horario_comercial?: { abre?: string; cierra?: string; dias?: number[] } | null;
    },
  ) {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('tipo', sql.NVarChar(20), input.tipo_cuenta)
      .input('prep', sql.Int, input.tiempo_preparacion_min ?? 0)
      .input(
        'horario',
        sql.NVarChar(sql.MAX),
        input.horario_comercial ? JSON.stringify(input.horario_comercial) : null,
      )
      .query(`
        UPDATE clientes
        SET tipo_cuenta = @tipo,
            tiempo_preparacion_min = @prep,
            horario_comercial = @horario::jsonb,
            fecha_actualizacion = NOW()
        WHERE usuario_id = @id
      `);
    return this.getPerfil(usuarioId);
  }

  async detalleAdmin(usuarioId: string) {
    const perfil = await this.getPerfil(usuarioId);
    const pool = await getPool();
    const stats = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<{
        viajes_total: number;
        viajes_finalizados: number;
        viajes_cancelados: number;
        importe_pagado: number;
        ticket_promedio: number;
      }>(`
        SELECT
          COUNT(*) AS viajes_total,
          SUM(CASE WHEN estado = 'finalizado' THEN 1 ELSE 0 END) AS viajes_finalizados,
          SUM(CASE WHEN estado = 'cancelado' THEN 1 ELSE 0 END) AS viajes_cancelados,
          COALESCE(SUM(CASE WHEN estado = 'finalizado' THEN tarifa_final ELSE 0 END), 0) AS importe_pagado,
          COALESCE(AVG(CASE WHEN estado = 'finalizado' THEN tarifa_final END), 0) AS ticket_promedio
        FROM viajes
        WHERE cliente_id = @id
      `);
    const porMetodo = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<{ metodo_pago: string; viajes: number; monto: number }>(`
        SELECT metodo_pago, COUNT(*) AS viajes, COALESCE(SUM(tarifa_final), 0) AS monto
        FROM viajes
        WHERE cliente_id = @id AND estado = 'finalizado'
        GROUP BY metodo_pago
      `);
    const recientes = await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .query<{
        id: string;
        fecha_solicitud: Date;
        estado: string;
        tarifa_final: number | null;
        metodo_pago: string;
        tipo_servicio: string;
        destino_direccion: string;
      }>(`
        SELECT id, fecha_solicitud, estado, tarifa_final, metodo_pago, tipo_servicio, destino_direccion
        FROM viajes
        WHERE cliente_id = @id
        ORDER BY fecha_solicitud DESC
        LIMIT 10
      `);
    const s = stats.recordset[0];
    return {
      cliente: perfil,
      stats: {
        viajes_total: Number(s?.viajes_total ?? 0),
        viajes_finalizados: Number(s?.viajes_finalizados ?? 0),
        viajes_cancelados: Number(s?.viajes_cancelados ?? 0),
        importe_pagado: Number(s?.importe_pagado ?? 0),
        ticket_promedio: Number(s?.ticket_promedio ?? 0),
      },
      por_metodo: porMetodo.recordset.map((x) => ({
        metodo_pago: x.metodo_pago,
        viajes: Number(x.viajes),
        monto: Number(x.monto),
      })),
      viajes_recientes: recientes.recordset.map((v) => ({
        id: String(v.id),
        fecha_solicitud: new Date(v.fecha_solicitud).toISOString(),
        estado: v.estado,
        tarifa_final: v.tarifa_final != null ? Number(v.tarifa_final) : null,
        metodo_pago: v.metodo_pago,
        tipo_servicio: v.tipo_servicio,
        destino_direccion: v.destino_direccion,
      })),
    };
  }

  async agregarDireccionUsada(usuarioId: string, dir: DireccionFavorita) {
    const perfil = await this.getPerfil(usuarioId);
    const key = `${dir.direccion}|${dir.lat.toFixed(5)}|${dir.lng.toFixed(5)}`;
    const filtered = perfil.direcciones_favoritas.filter(
      (d) => `${d.direccion}|${d.lat.toFixed(5)}|${d.lng.toFixed(5)}` !== key,
    );
    const next = [dir, ...filtered].slice(0, 12);
    return this.actualizarPreferencias(usuarioId, { direcciones_favoritas: next });
  }

  async actualizarAdmin(
    usuarioId: string,
    input: {
      nombre?: string;
      email?: string;
      telefono?: string;
      dni?: string;
      plan_suscripcion?: PlanCliente;
      tipo_cuenta?: 'particular' | 'restaurante' | 'comercio';
      tiempo_preparacion_min?: number;
      horario_comercial?: { abre?: string; cierra?: string; dias?: number[] } | null;
      direccion?: string | null;
      calle?: string | null;
      numero?: string | null;
      piso_dpto?: string | null;
      barrio?: string | null;
      ciudad?: string | null;
      provincia?: string | null;
      zona_h3?: string | null;
      zona_nombre?: string | null;
      estado?: 'activo' | 'inactivo' | 'suspendido';
    },
  ) {
    const actual = await this.getPerfil(usuarioId);
    const pool = await getPool();

    if (
      input.nombre !== undefined ||
      input.email !== undefined ||
      input.telefono !== undefined ||
      input.estado !== undefined
    ) {
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, usuarioId)
        .input('nombre', sql.NVarChar(150), input.nombre ?? actual.nombre)
        .input('email', sql.NVarChar(255), input.email ?? actual.email)
        .input('telefono', sql.NVarChar(20), input.telefono ?? actual.telefono)
        .input('estado', sql.NVarChar(30), input.estado ?? actual.estado)
        .query(`
          UPDATE usuarios
          SET nombre = @nombre, email = @email, telefono = @telefono, estado = @estado
          WHERE id = @id
        `);
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('dni', sql.NVarChar(20), input.dni ?? actual.dni)
      .input('tipo', sql.NVarChar(20), input.tipo_cuenta ?? actual.tipo_cuenta)
      .input(
        'prep',
        sql.Int,
        input.tiempo_preparacion_min ?? actual.tiempo_preparacion_min ?? 0,
      )
      .input(
        'horario',
        sql.NVarChar(sql.MAX),
        input.horario_comercial !== undefined
          ? input.horario_comercial
            ? JSON.stringify(input.horario_comercial)
            : null
          : actual.horario_comercial
            ? JSON.stringify(actual.horario_comercial)
            : null,
      )
      .input(
        'dir',
        sql.NVarChar(300),
        input.direccion !== undefined ? input.direccion : actual.direccion,
      )
      .input('calle', sql.NVarChar(150), input.calle !== undefined ? input.calle : actual.calle)
      .input(
        'numero',
        sql.NVarChar(20),
        input.numero !== undefined ? input.numero : actual.numero,
      )
      .input(
        'piso',
        sql.NVarChar(40),
        input.piso_dpto !== undefined ? input.piso_dpto : actual.piso_dpto,
      )
      .input(
        'barrio',
        sql.NVarChar(100),
        input.barrio !== undefined ? input.barrio : actual.barrio,
      )
      .input(
        'ciudad',
        sql.NVarChar(100),
        input.ciudad !== undefined ? input.ciudad : actual.ciudad,
      )
      .input(
        'provincia',
        sql.NVarChar(100),
        input.provincia !== undefined ? input.provincia : actual.provincia,
      )
      .input(
        'zona_h3',
        sql.NVarChar(64),
        input.zona_h3 !== undefined ? input.zona_h3 : actual.zona_h3,
      )
      .input(
        'zona_nombre',
        sql.NVarChar(100),
        input.zona_nombre !== undefined ? input.zona_nombre : actual.zona_nombre,
      )
      .query(`
        UPDATE clientes
        SET dni = @dni,
            tipo_cuenta = @tipo,
            tiempo_preparacion_min = @prep,
            horario_comercial = @horario::jsonb,
            direccion = @dir,
            calle = @calle,
            numero = @numero,
            piso_dpto = @piso,
            barrio = @barrio,
            ciudad = @ciudad,
            provincia = @provincia,
            zona_h3 = @zona_h3,
            zona_nombre = @zona_nombre,
            fecha_actualizacion = NOW()
        WHERE usuario_id = @id
      `);

    if (input.plan_suscripcion && input.plan_suscripcion !== actual.plan_suscripcion) {
      await this.actualizarPlan(usuarioId, input.plan_suscripcion);
    }

    return this.getPerfil(usuarioId);
  }

  async darDeBaja(usuarioId: string) {
    return this.actualizarAdmin(usuarioId, { estado: 'inactivo' });
  }

  async reactivar(usuarioId: string) {
    return this.actualizarAdmin(usuarioId, { estado: 'activo' });
  }

  async actualizarPlan(usuarioId: string, plan: PlanCliente) {
    const montos: Record<PlanCliente, number> = {
      gratuito: 0,
      basico: 3000,
      plus: 8000,
      business: 15000,
    };
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, usuarioId)
      .input('plan', sql.NVarChar(20), plan)
      .query(`
        UPDATE clientes
        SET plan_suscripcion = @plan,
            estado_suscripcion = 'activa',
            fecha_inicio_suscripcion = NOW(),
            fecha_fin_suscripcion = NOW() + INTERVAL '1 month'
        WHERE usuario_id = @id
      `);

    await pool
      .request()
      .input('uid', sql.UniqueIdentifier, usuarioId)
      .input('plan', sql.NVarChar(20), plan)
      .input('monto', sql.Decimal(12, 2), montos[plan])
      .query(`
        INSERT INTO suscripciones (usuario_id, tipo_usuario, plan, estado, fecha_inicio, fecha_fin, monto_mensual, beneficios)
        VALUES (
          @uid, 'cliente', @plan, 'activa',
          NOW(), NOW() + INTERVAL '1 month',
          @monto,
          (SELECT CASE @plan
            WHEN 'basico' THEN '{"descuento_pct":10}'
            WHEN 'plus' THEN '{"descuento_pct":20}'
            WHEN 'business' THEN '{"descuento_pct":30}'
            ELSE '{"descuento_pct":0}' END)
        )
      `);

    return this.getPerfil(usuarioId);
  }
}

export const clienteModel = new ClienteModel();

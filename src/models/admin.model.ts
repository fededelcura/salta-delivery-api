import { getPool, sql, SqlRequest } from '../config/database.js';
import type { DashboardKpis } from '../types/domain.js';
import { NotFoundError } from '../utils/errors.js';
import { parseJsonField, requireJsonField } from '../utils/json-field.js';

export class AdminModel {
  async dashboard(): Promise<DashboardKpis> {
    const pool = await getPool();
    const result = await pool.request().query<{
      viajes_hoy: number;
      viajes_activos: number;
      cadetes_online: number;
      clientes_activos: number;
      usuarios_activos: number;
      negocios_activos: number;
      restaurantes_activos: number;
      comercios_activos: number;
      ingresos_hoy: number;
      comisiones_hoy: number;
      incidencias_abiertas: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM viajes WHERE fecha_solicitud::date = CURRENT_DATE) AS viajes_hoy,
        (SELECT COUNT(*) FROM viajes WHERE estado NOT IN ('finalizado', 'cancelado')) AS viajes_activos,
        (SELECT COUNT(*) FROM cadetes WHERE disponibilidad = 'online') AS cadetes_online,
        (SELECT COUNT(*) FROM usuarios WHERE rol = 'cliente' AND estado = 'activo') AS clientes_activos,
        (SELECT COUNT(*)
           FROM clientes c
           INNER JOIN usuarios u ON u.id = c.usuario_id
           WHERE u.estado = 'activo'
             AND COALESCE(c.tipo_cuenta, 'particular') = 'particular') AS usuarios_activos,
        (SELECT COUNT(*)
           FROM clientes c
           INNER JOIN usuarios u ON u.id = c.usuario_id
           WHERE u.estado = 'activo'
             AND c.tipo_cuenta IN ('restaurante', 'comercio')) AS negocios_activos,
        (SELECT COUNT(*)
           FROM clientes c
           INNER JOIN usuarios u ON u.id = c.usuario_id
           WHERE u.estado = 'activo' AND c.tipo_cuenta = 'restaurante') AS restaurantes_activos,
        (SELECT COUNT(*)
           FROM clientes c
           INNER JOIN usuarios u ON u.id = c.usuario_id
           WHERE u.estado = 'activo' AND c.tipo_cuenta = 'comercio') AS comercios_activos,
        (SELECT COALESCE(SUM(tarifa_final), 0) FROM viajes
           WHERE estado = 'finalizado' AND fecha_fin::date = CURRENT_DATE) AS ingresos_hoy,
        (SELECT COALESCE(SUM(comision_plataforma), 0) FROM viajes
           WHERE estado = 'finalizado' AND fecha_fin::date = CURRENT_DATE) AS comisiones_hoy,
        (SELECT COUNT(*) FROM incidencias WHERE estado IN ('abierta', 'en_proceso', 'escalada')) AS incidencias_abiertas
    `);
    const r = result.recordset[0];
    return {
      viajes_hoy: Number(r?.viajes_hoy ?? 0),
      viajes_activos: Number(r?.viajes_activos ?? 0),
      cadetes_online: Number(r?.cadetes_online ?? 0),
      clientes_activos: Number(r?.clientes_activos ?? 0),
      usuarios_activos: Number(r?.usuarios_activos ?? 0),
      negocios_activos: Number(r?.negocios_activos ?? 0),
      restaurantes_activos: Number(r?.restaurantes_activos ?? 0),
      comercios_activos: Number(r?.comercios_activos ?? 0),
      ingresos_hoy: Number(r?.ingresos_hoy ?? 0),
      comisiones_hoy: Number(r?.comisiones_hoy ?? 0),
      incidencias_abiertas: Number(r?.incidencias_abiertas ?? 0),
    };
  }

  async reportes(opts: {
    dias?: number;
    tipos?: string[];
    metodos?: string[];
    cadete_id?: string | null;
    cliente_id?: string | null;
    zonas?: string[];
    franjas?: string[];
  } = {}) {
    const pool = await getPool();
    const d = Math.min(Math.max(opts.dias ?? 30, 7), 365);
    const tiposOk = ['delivery', 'mensajeria', 'envio_paquete'] as const;
    const metodosOk = ['efectivo', 'tarjeta', 'mercadopago', 'billetera'] as const;
    const franjasOk = [
      'valle',
      'pico_manana',
      'pico_mediodia',
      'pico_tarde',
      'noche',
      'madrugada',
    ] as const;
    const tipos = (opts.tipos ?? []).filter((t) =>
      (tiposOk as readonly string[]).includes(t),
    );
    const metodos = (opts.metodos ?? []).filter((m) =>
      (metodosOk as readonly string[]).includes(m),
    );
    const zonas = (opts.zonas ?? []).map((z) => z.trim()).filter(Boolean);
    const franjas = (opts.franjas ?? []).filter((f) =>
      (franjasOk as readonly string[]).includes(f),
    );
    const tiposCsv = tipos.length ? tipos.join(',') : null;
    const metodosCsv = metodos.length ? metodos.join(',') : null;
    const zonasCsv = zonas.length ? zonas.join(',') : null;
    const franjasCsv = franjas.length ? franjas.join(',') : null;
    const cadeteId = opts.cadete_id || null;
    const clienteId = opts.cliente_id || null;

    const bindFilters = (req: SqlRequest) =>
      req
        .input('dias', sql.Int, d)
        .input('tiposCsv', sql.NVarChar(200), tiposCsv)
        .input('metodosCsv', sql.NVarChar(200), metodosCsv)
        .input('zonasCsv', sql.NVarChar(sql.MAX), zonasCsv)
        .input('franjasCsv', sql.NVarChar(200), franjasCsv)
        .input('cadete', sql.UniqueIdentifier, cadeteId)
        .input('cliente', sql.UniqueIdentifier, clienteId);

    const filtroTipoMetodo = `
      AND (
        @tiposCsv IS NULL
        OR tipo_servicio IN (
          SELECT trim(both from unnest(string_to_array(@tiposCsv, ',')))
        )
      )
      AND (
        @metodosCsv IS NULL
        OR metodo_pago IN (
          SELECT trim(both from unnest(string_to_array(@metodosCsv, ',')))
        )
      )
      AND (@cadete IS NULL OR cadete_id = @cadete)
      AND (@cliente IS NULL OR cliente_id = @cliente)
      AND (
        @franjasCsv IS NULL
        OR COALESCE(detalle_tarifa::jsonb->>'franja_hora', 'valle')
           IN (
             SELECT trim(both from unnest(string_to_array(@franjasCsv, ',')))
           )
      )
      AND (
        @zonasCsv IS NULL
        OR COALESCE(detalle_tarifa::jsonb->>'zona_nombre', '')
           IN (
             SELECT trim(both from unnest(string_to_array(@zonasCsv, ',')))
           )
        OR COALESCE(detalle_tarifa::jsonb->>'zona_h3', '')
           IN (
             SELECT trim(both from unnest(string_to_array(@zonasCsv, ',')))
           )
      )
    `;

    const financieros = await bindFilters(pool.request()).query<{
      dia: string;
      viajes: number;
      ingresos: number;
      comisiones: number;
      egresos: number;
    }>(`
      SELECT TO_CHAR(fecha_fin, 'YYYY-MM-DD') AS dia,
             COUNT(*) AS viajes,
             SUM(COALESCE(tarifa_final, 0)) AS ingresos,
             SUM(COALESCE(comision_plataforma, 0)) AS comisiones,
             SUM(COALESCE(pago_cadete, 0)) AS egresos
      FROM viajes
      WHERE estado = 'finalizado'
        AND fecha_fin >= NOW() - INTERVAL '1 day' * @dias
        ${filtroTipoMetodo}
      GROUP BY TO_CHAR(fecha_fin, 'YYYY-MM-DD')
      ORDER BY dia
    `);

    const operativos = await bindFilters(pool.request()).query<{
      estado: string;
      cantidad: number;
    }>(`
      SELECT estado, COUNT(*) AS cantidad
      FROM viajes
      WHERE fecha_solicitud >= NOW() - INTERVAL '1 day' * @dias
        ${filtroTipoMetodo}
      GROUP BY estado
    `);

    const porTipo = await bindFilters(pool.request()).query<{
      tipo_servicio: string;
      viajes: number;
      ingresos: number;
      comisiones: number;
    }>(`
      SELECT tipo_servicio,
             COUNT(*) AS viajes,
             SUM(COALESCE(tarifa_final, 0)) AS ingresos,
             SUM(COALESCE(comision_plataforma, 0)) AS comisiones
      FROM viajes
      WHERE estado = 'finalizado'
        AND fecha_fin >= NOW() - INTERVAL '1 day' * @dias
        ${filtroTipoMetodo}
      GROUP BY tipo_servicio
      ORDER BY tipo_servicio
    `);

    const porMetodo = await bindFilters(pool.request()).query<{
      metodo_pago: string;
      viajes: number;
      monto: number;
    }>(`
      SELECT metodo_pago,
             COUNT(*) AS viajes,
             SUM(COALESCE(tarifa_final, 0)) AS monto
      FROM viajes
      WHERE estado = 'finalizado'
        AND fecha_fin >= NOW() - INTERVAL '1 day' * @dias
        ${filtroTipoMetodo}
      GROUP BY metodo_pago
    `);

    const porZona = await bindFilters(pool.request()).query<{
      zona: string;
      viajes: number;
      ingresos: number;
    }>(`
      SELECT COALESCE(NULLIF(detalle_tarifa::jsonb->>'zona_nombre', ''), 'Sin zona') AS zona,
             COUNT(*) AS viajes,
             SUM(COALESCE(tarifa_final, 0)) AS ingresos
      FROM viajes
      WHERE estado = 'finalizado'
        AND fecha_fin >= NOW() - INTERVAL '1 day' * @dias
        ${filtroTipoMetodo}
      GROUP BY COALESCE(NULLIF(detalle_tarifa::jsonb->>'zona_nombre', ''), 'Sin zona')
      ORDER BY viajes DESC
    `);

    const porFranja = await bindFilters(pool.request()).query<{
      franja: string;
      viajes: number;
      ingresos: number;
    }>(`
      SELECT COALESCE(detalle_tarifa::jsonb->>'franja_hora', 'valle') AS franja,
             COUNT(*) AS viajes,
             SUM(COALESCE(tarifa_final, 0)) AS ingresos
      FROM viajes
      WHERE estado = 'finalizado'
        AND fecha_fin >= NOW() - INTERVAL '1 day' * @dias
        ${filtroTipoMetodo}
      GROUP BY COALESCE(detalle_tarifa::jsonb->>'franja_hora', 'valle')
      ORDER BY viajes DESC
    `);

    const catalogoZonas = await pool.request().query<{ h3_index: string; nombre: string | null }>(`
      SELECT h3_index, nombre FROM zonas_hexagonos WHERE activa = TRUE ORDER BY nombre
    `);

    let sujeto: {
      tipo: 'todos' | 'cadete' | 'cliente';
      id: string | null;
      nombre: string | null;
    } = { tipo: 'todos', id: null, nombre: null };

    if (cadeteId) {
      const u = await pool
        .request()
        .input('id', sql.UniqueIdentifier, cadeteId)
        .query<{ nombre: string }>(`SELECT nombre FROM usuarios WHERE id = @id`);
      sujeto = {
        tipo: 'cadete',
        id: cadeteId,
        nombre: u.recordset[0]?.nombre ?? 'Cadete',
      };
    } else if (clienteId) {
      const u = await pool
        .request()
        .input('id', sql.UniqueIdentifier, clienteId)
        .query<{ nombre: string }>(`SELECT nombre FROM usuarios WHERE id = @id`);
      sujeto = {
        tipo: 'cliente',
        id: clienteId,
        nombre: u.recordset[0]?.nombre ?? 'Cliente',
      };
    }

    const fin = financieros.recordset.map((x) => ({
      dia: x.dia,
      viajes: Number(x.viajes),
      ingresos: Number(x.ingresos),
      comisiones: Number(x.comisiones),
      egresos: Number(x.egresos),
    }));

    const totales = fin.reduce(
      (a, x) => ({
        viajes: a.viajes + x.viajes,
        ingresos: a.ingresos + x.ingresos,
        comisiones: a.comisiones + x.comisiones,
        egresos: a.egresos + x.egresos,
      }),
      { viajes: 0, ingresos: 0, comisiones: 0, egresos: 0 },
    );

    return {
      periodo_dias: d,
      sujeto,
      catalogo: {
        zonas: catalogoZonas.recordset.map((z) => ({
          h3_index: z.h3_index,
          nombre: z.nombre ?? z.h3_index,
        })),
        franjas: [...franjasOk],
      },
      filtros: {
        tipos: tipos.length ? tipos : [...tiposOk],
        metodos: metodos.length ? metodos : [...metodosOk],
        zonas,
        franjas: franjas.length ? franjas : [...franjasOk],
        cadete_id: cadeteId,
        cliente_id: clienteId,
      },
      totales,
      financieros: fin,
      operativos: operativos.recordset.map((x) => ({
        estado: x.estado,
        cantidad: Number(x.cantidad),
      })),
      por_tipo: porTipo.recordset.map((x) => ({
        tipo_servicio: x.tipo_servicio,
        viajes: Number(x.viajes),
        ingresos: Number(x.ingresos),
        comisiones: Number(x.comisiones),
      })),
      por_metodo: porMetodo.recordset.map((x) => ({
        metodo_pago: x.metodo_pago,
        viajes: Number(x.viajes),
        monto: Number(x.monto),
      })),
      por_zona: porZona.recordset.map((x) => ({
        zona: x.zona,
        viajes: Number(x.viajes),
        ingresos: Number(x.ingresos),
      })),
      por_franja: porFranja.recordset.map((x) => ({
        franja: x.franja,
        viajes: Number(x.viajes),
        ingresos: Number(x.ingresos),
      })),
    };
  }

  async guardarReporte(input: {
    tipo: string;
    titulo: string;
    periodo_desde?: string | null;
    periodo_hasta?: string | null;
    generado_por?: string | null;
    resumen: Record<string, unknown>;
    detalle: Record<string, unknown>;
  }) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('tipo', sql.NVarChar(40), input.tipo)
      .input('titulo', sql.NVarChar(200), input.titulo)
      .input('desde', sql.Date, input.periodo_desde ?? null)
      .input('hasta', sql.Date, input.periodo_hasta ?? null)
      .input('uid', sql.UniqueIdentifier, input.generado_por ?? null)
      .input('resumen', sql.NVarChar(sql.MAX), JSON.stringify(input.resumen ?? {}))
      .input('detalle', sql.NVarChar(sql.MAX), JSON.stringify(input.detalle ?? {}))
      .query<{ id: string; fecha_creacion: Date }>(`
        INSERT INTO reportes_guardados (
          tipo, titulo, periodo_desde, periodo_hasta, generado_por, resumen_json, detalle_json
        )
        VALUES (@tipo, @titulo, @desde, @hasta, @uid, @resumen::jsonb, @detalle::jsonb)
        RETURNING id, fecha_creacion
      `);
    const row = result.recordset[0];
    return {
      id: String(row.id),
      tipo: input.tipo,
      titulo: input.titulo,
      periodo_desde: input.periodo_desde ?? null,
      periodo_hasta: input.periodo_hasta ?? null,
      resumen: input.resumen,
      detalle: input.detalle,
      fecha_creacion: new Date(row.fecha_creacion).toISOString(),
    };
  }

  async listarReportesGuardados(limit = 30) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('lim', sql.Int, Math.min(limit, 100))
      .query<{
        id: string;
        tipo: string;
        titulo: string;
        periodo_desde: Date | null;
        periodo_hasta: Date | null;
        resumen_json: string;
        fecha_creacion: Date;
        generado_nombre: string | null;
      }>(`
        SELECT r.id, r.tipo, r.titulo, r.periodo_desde, r.periodo_hasta,
               r.resumen_json, r.fecha_creacion, u.nombre AS generado_nombre
        FROM reportes_guardados r
        LEFT JOIN usuarios u ON u.id = r.generado_por
        ORDER BY r.fecha_creacion DESC
        LIMIT @lim
      `);
    return result.recordset.map((r) => ({
      id: String(r.id),
      tipo: r.tipo,
      titulo: r.titulo,
      periodo_desde: r.periodo_desde
        ? new Date(r.periodo_desde).toISOString().slice(0, 10)
        : null,
      periodo_hasta: r.periodo_hasta
        ? new Date(r.periodo_hasta).toISOString().slice(0, 10)
        : null,
      resumen: parseJsonField(r.resumen_json, {} as Record<string, unknown>),
      fecha_creacion: new Date(r.fecha_creacion).toISOString(),
      generado_nombre: r.generado_nombre,
    }));
  }

  async getReporteGuardado(id: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<{
        id: string;
        tipo: string;
        titulo: string;
        periodo_desde: Date | null;
        periodo_hasta: Date | null;
        resumen_json: string;
        detalle_json: string;
        fecha_creacion: Date;
      }>(`
        SELECT id, tipo, titulo, periodo_desde, periodo_hasta,
               resumen_json, detalle_json, fecha_creacion
        FROM reportes_guardados WHERE id = @id
      `);
    const r = result.recordset[0];
    if (!r) throw new NotFoundError('Reporte no encontrado');
    return {
      id: String(r.id),
      tipo: r.tipo,
      titulo: r.titulo,
      periodo_desde: r.periodo_desde
        ? new Date(r.periodo_desde).toISOString().slice(0, 10)
        : null,
      periodo_hasta: r.periodo_hasta
        ? new Date(r.periodo_hasta).toISOString().slice(0, 10)
        : null,
      resumen: parseJsonField(r.resumen_json, {} as Record<string, unknown>),
      detalle: parseJsonField(r.detalle_json, {} as Record<string, unknown>),
      fecha_creacion: new Date(r.fecha_creacion).toISOString(),
    };
  }

  async getConfig(clave: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('clave', sql.NVarChar(100), clave)
      .query<{ valor: unknown }>(`SELECT valor FROM configuraciones WHERE clave = @clave`);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError(`Config ${clave} no encontrada`);
    return requireJsonField<Record<string, unknown>>(row.valor);
  }

  async setTarifasBase(partial: {
    base_fija?: number;
    precio_km?: number;
    precio_minuto?: number;
  }) {
    const actual = (await this.getConfig('tarifas.base')) as {
      base_fija: number;
      precio_km: number;
      precio_minuto: number;
      moneda?: string;
      ciudad?: string;
      pais?: string;
    };
    const next = { ...actual, ...partial };
    const pool = await getPool();
    await pool
      .request()
      .input('valor', sql.NVarChar(sql.MAX), JSON.stringify(next))
      .query(`
        UPDATE configuraciones
        SET valor = @valor::jsonb
        WHERE clave = 'tarifas.base'
      `);
    return next;
  }

  async listarIncidencias() {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, viaje_id, usuario_reporta, tipo, nivel, descripcion, estado, asignado_a, fecha_creacion
      FROM incidencias
      ORDER BY fecha_creacion DESC
    `);
    return result.recordset;
  }

  async actualizarIncidencia(
    id: string,
    data: { estado?: string; asignado_a?: string; resolucion?: string },
  ) {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('estado', sql.NVarChar(20), data.estado ?? null)
      .input('asignado', sql.UniqueIdentifier, data.asignado_a ?? null)
      .input('resolucion', sql.NVarChar(2000), data.resolucion ?? null)
      .query(`
        UPDATE incidencias
        SET estado = COALESCE(@estado, estado),
            asignado_a = COALESCE(@asignado, asignado_a),
            resolucion = COALESCE(@resolucion, resolucion),
            fecha_resolucion = CASE
              WHEN @estado IN ('resuelta', 'cerrada') THEN NOW()
              ELSE fecha_resolucion END
        WHERE id = @id
      `);
    return { id, ...data };
  }

  async crearIncidencia(input: {
    viaje_id?: string;
    usuario_reporta: string;
    tipo: string;
    nivel: string;
    descripcion: string;
  }) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('viaje', sql.UniqueIdentifier, input.viaje_id ?? null)
      .input('user', sql.UniqueIdentifier, input.usuario_reporta)
      .input('tipo', sql.NVarChar(30), input.tipo)
      .input('nivel', sql.NVarChar(10), input.nivel)
      .input('desc', sql.NVarChar(2000), input.descripcion)
      .query<{ id: string }>(`
        INSERT INTO incidencias (viaje_id, usuario_reporta, tipo, nivel, descripcion)
        VALUES (@viaje, @user, @tipo, @nivel, @desc)
        RETURNING id
      `);
    return { id: result.recordset[0]?.id, ...input };
  }

  /** Crea incidencia si no hay otra abierta del mismo tipo para el viaje. */
  async crearIncidenciaSiNoExiste(input: {
    viaje_id: string;
    usuario_reporta: string;
    tipo: string;
    nivel: string;
    descripcion: string;
  }) {
    const pool = await getPool();
    const existing = await pool
      .request()
      .input('viaje', sql.UniqueIdentifier, input.viaje_id)
      .input('tipo', sql.NVarChar(30), input.tipo)
      .query<{ id: string }>(`
        SELECT id FROM incidencias
        WHERE viaje_id = @viaje
          AND tipo = @tipo
          AND estado IN ('abierta', 'en_proceso', 'escalada')
        LIMIT 1
      `);
    if (existing.recordset[0]?.id) {
      return { id: existing.recordset[0].id, already_exists: true, ...input };
    }
    const created = await this.crearIncidencia(input);
    return { ...created, already_exists: false };
  }

  /** Sube nivel/tipo a sin_cadete alta si ya existe alerta del viaje, o crea una. */
  async escalarSinCadete(input: {
    viaje_id: string;
    usuario_reporta: string;
    descripcion: string;
  }) {
    const pool = await getPool();
    const existing = await pool
      .request()
      .input('viaje', sql.UniqueIdentifier, input.viaje_id)
      .query<{ id: string; tipo: string }>(`
        SELECT id, tipo FROM incidencias
        WHERE viaje_id = @viaje
          AND estado IN ('abierta', 'en_proceso', 'escalada')
          AND tipo IN ('viaje_nuevo', 'sin_cadete', 'buscando_cadete')
        ORDER BY fecha_creacion DESC
        LIMIT 1
      `);
    const row = existing.recordset[0];
    if (row) {
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, row.id)
        .input('desc', sql.NVarChar(2000), input.descripcion)
        .query(`
          UPDATE incidencias
          SET tipo = 'sin_cadete',
              nivel = 'alta',
              estado = 'escalada',
              descripcion = @desc
          WHERE id = @id
        `);
      return { id: row.id, escalated: true };
    }
    return this.crearIncidencia({
      viaje_id: input.viaje_id,
      usuario_reporta: input.usuario_reporta,
      tipo: 'sin_cadete',
      nivel: 'alta',
      descripcion: input.descripcion,
    });
  }

  private readonly PLANES_FALLBACK = {
    cliente: [
      { plan: 'gratuito', monto_mensual: 0, descuento_pct: 0 },
      { plan: 'basico', monto_mensual: 3000, descuento_pct: 10 },
      { plan: 'plus', monto_mensual: 8000, descuento_pct: 20 },
      { plan: 'business', monto_mensual: 15000, descuento_pct: 30 },
    ],
    cadete: [
      { plan: 'trial', monto_mensual: 0, comision_pct: 15, dias_trial: 14 },
      { plan: 'silver', monto_mensual: 6000, comision_pct: 13 },
      { plan: 'gold', monto_mensual: 10000, comision_pct: 10 },
      { plan: 'premium', monto_mensual: 15000, comision_pct: 8 },
    ],
  };

  /** Compat sync (fallback). Preferí getPlanes(). */
  planes() {
    return this.PLANES_FALLBACK;
  }

  async getTarifasBase() {
    return this.getConfig('tarifas.base') as Promise<{
      base_fija: number;
      precio_km: number;
      precio_minuto: number;
      moneda?: string;
      ciudad?: string;
      pais?: string;
    }>;
  }

  private mapPlanesCliente(raw: Record<string, unknown>) {
    const order = ['gratuito', 'basico', 'plus', 'business'];
    return order.map((plan) => {
      const v = (raw[plan] ?? {}) as { monto_mensual?: number; descuento_pct?: number };
      const fb = this.PLANES_FALLBACK.cliente.find((p) => p.plan === plan)!;
      return {
        plan,
        monto_mensual: Number(v.monto_mensual ?? fb.monto_mensual),
        descuento_pct: Number(v.descuento_pct ?? fb.descuento_pct),
      };
    });
  }

  private mapPlanesCadete(raw: Record<string, unknown>) {
    const order = ['trial', 'silver', 'gold', 'premium'];
    return order.map((plan) => {
      const v = (raw[plan] ?? {}) as {
        monto_mensual?: number;
        comision_pct?: number;
        dias_trial?: number;
      };
      const fb = this.PLANES_FALLBACK.cadete.find((p) => p.plan === plan)!;
      return {
        plan,
        monto_mensual: Number(v.monto_mensual ?? fb.monto_mensual),
        comision_pct: Number(v.comision_pct ?? fb.comision_pct),
        ...(plan === 'trial'
          ? { dias_trial: Number(v.dias_trial ?? fb.dias_trial ?? 14) }
          : {}),
      };
    });
  }

  async getPlanes() {
    try {
      const [cli, cad] = await Promise.all([
        this.getConfig('planes.cliente'),
        this.getConfig('planes.cadete'),
      ]);
      return {
        cliente: this.mapPlanesCliente(cli),
        cadete: this.mapPlanesCadete(cad),
      };
    } catch {
      return this.PLANES_FALLBACK;
    }
  }

  async setPlanes(input: {
    cliente?: Array<{ plan: string; monto_mensual: number; descuento_pct: number }>;
    cadete?: Array<{
      plan: string;
      monto_mensual: number;
      comision_pct: number;
      dias_trial?: number;
    }>;
  }) {
    const pool = await getPool();
    if (input.cliente) {
      const obj: Record<string, { monto_mensual: number; descuento_pct: number }> = {};
      for (const p of input.cliente) {
        obj[p.plan] = {
          monto_mensual: p.monto_mensual,
          descuento_pct: p.descuento_pct,
        };
      }
      await pool
        .request()
        .input('valor', sql.NVarChar(sql.MAX), JSON.stringify(obj))
        .query(`
          UPDATE configuraciones SET valor = @valor::jsonb
          WHERE clave = 'planes.cliente'
        `);
    }
    if (input.cadete) {
      const obj: Record<
        string,
        { monto_mensual: number; comision_pct: number; dias_trial?: number }
      > = {};
      for (const p of input.cadete) {
        obj[p.plan] = {
          monto_mensual: p.monto_mensual,
          comision_pct: p.comision_pct,
          ...(p.dias_trial != null ? { dias_trial: p.dias_trial } : {}),
        };
      }
      await pool
        .request()
        .input('valor', sql.NVarChar(sql.MAX), JSON.stringify(obj))
        .query(`
          UPDATE configuraciones SET valor = @valor::jsonb
          WHERE clave = 'planes.cadete'
        `);
    }
    return this.getPlanes();
  }
}

export const adminModel = new AdminModel();

import { getPool, sql } from '../config/database.js';
import type {
  Coordenada,
  DetalleTarifa,
  EstadoViaje,
  MetodoPago,
  PlanCadete,
  PlanCliente,
  TipoServicio,
  Viaje,
} from '../types/domain.js';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { geolocalizacionService } from '../services/geolocalizacion.service.js';
import { tarifasService } from '../services/tarifas.service.js';
import { asignacionService, type CadeteCandidato } from '../services/asignacion.service.js';
import { cadeteModel } from './cadete.model.js';
import { clienteModel } from './cliente.model.js';
import { getRedis } from '../config/redis.js';
import { parseJsonField } from '../utils/json-field.js';

interface ViajeRow {
  id: string;
  cliente_id: string;
  cadete_id: string | null;
  tipo_servicio: TipoServicio;
  origen_direccion: string;
  origen_lat: number;
  origen_lng: number;
  destino_direccion: string;
  destino_lat: number;
  destino_lng: number;
  distancia_km: number | null;
  tiempo_estimado_min: number | null;
  tarifa_estimada: number | null;
  tarifa_final: number | null;
  comision_plataforma: number | null;
  pago_cadete: number | null;
  detalle_tarifa: string | Record<string, unknown> | null;
  estado: EstadoViaje;
  fecha_solicitud: Date;
  tiempo_preparacion_min?: number | null;
  listo_para_retiro_en?: Date | null;
  metodo_pago: MetodoPago;
  estado_pago: string;
  calificacion_cliente: number | null;
  calificacion_cadete: number | null;
}

function mapViaje(row: ViajeRow): Viaje {
  const detalle = row.detalle_tarifa
    ? parseJsonField<DetalleTarifa | null>(row.detalle_tarifa, null)
    : null;
  return {
    id: String(row.id),
    cliente_id: String(row.cliente_id),
    cadete_id: row.cadete_id ? String(row.cadete_id) : null,
    tipo_servicio: row.tipo_servicio,
    origen_direccion: row.origen_direccion,
    origen: { lat: Number(row.origen_lat), lng: Number(row.origen_lng) },
    destino_direccion: row.destino_direccion,
    destino: { lat: Number(row.destino_lat), lng: Number(row.destino_lng) },
    distancia_km: row.distancia_km != null ? Number(row.distancia_km) : null,
    tiempo_estimado_min: row.tiempo_estimado_min,
    tarifa_estimada: row.tarifa_estimada != null ? Number(row.tarifa_estimada) : null,
    tarifa_final: row.tarifa_final != null ? Number(row.tarifa_final) : null,
    comision_plataforma:
      row.comision_plataforma != null ? Number(row.comision_plataforma) : null,
    pago_cadete: row.pago_cadete != null ? Number(row.pago_cadete) : null,
    detalle_tarifa: detalle,
    estado: row.estado,
    fecha_solicitud: new Date(row.fecha_solicitud).toISOString(),
    tiempo_preparacion_min:
      row.tiempo_preparacion_min != null ? Number(row.tiempo_preparacion_min) : null,
    listo_para_retiro_en: row.listo_para_retiro_en
      ? new Date(row.listo_para_retiro_en).toISOString()
      : null,
    metodo_pago: row.metodo_pago,
    estado_pago: row.estado_pago as Viaje['estado_pago'],
    calificacion_cliente: row.calificacion_cliente,
    calificacion_cadete: row.calificacion_cadete,
  };
}

const SELECT_VIAJE = `
  SELECT id, cliente_id, cadete_id, tipo_servicio,
         origen_direccion, origen_lat, origen_lng,
         destino_direccion, destino_lat, destino_lng,
         distancia_km, tiempo_estimado_min, tarifa_estimada, tarifa_final,
         comision_plataforma, pago_cadete, detalle_tarifa, estado, fecha_solicitud,
         tiempo_preparacion_min, listo_para_retiro_en,
         metodo_pago, estado_pago, calificacion_cliente, calificacion_cadete
  FROM viajes
`;

export class ViajeModel {
  async getById(id: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<ViajeRow>(`${SELECT_VIAJE} WHERE id = @id`);
    const row = result.recordset[0];
    if (!row) throw new NotFoundError('Viaje no encontrado');
    return mapViaje(row);
  }

  async calcularTarifaPreview(input: {
    origen: Coordenada;
    destino: Coordenada;
    planCliente?: PlanCliente;
    planCadete?: PlanCadete;
    tipoServicio?: TipoServicio;
    zonaMultiplier?: number;
    demandaMultiplier?: number;
    horaMultiplier?: number;
  }) {
    const distancia_km = geolocalizacionService.distanciaKm(input.origen, input.destino);
    const tiempo_estimado_min = geolocalizacionService.etaMinutos(distancia_km);
    const detalle = await tarifasService.calcularConConfig({
      distanciaKm: distancia_km,
      tiempoMin: tiempo_estimado_min,
      planCliente: input.planCliente ?? 'gratuito',
      planCadete: input.planCadete ?? 'trial',
      tipoServicio: input.tipoServicio ?? 'delivery',
      origen: input.origen,
      multiplicadores: {
        zona: input.zonaMultiplier,
        demanda: input.demandaMultiplier,
        hora: input.horaMultiplier,
      },
    });
    return {
      distancia_km,
      tiempo_estimado_min,
      detalle,
      dinamicos: {
        franja_hora: detalle.franja_hora,
        zona_nombre: detalle.zona_nombre,
        demanda_nivel: detalle.demanda_nivel,
        mult_hora: detalle.mult_hora,
        mult_zona: detalle.mult_zona,
        mult_demanda: detalle.mult_demanda,
        explicacion: detalle.multiplicadores_explicacion ?? [],
      },
    };
  }

  async solicitar(input: {
    clienteId: string;
    tipo_servicio: TipoServicio;
    origen_direccion: string;
    origen: Coordenada;
    destino_direccion: string;
    destino: Coordenada;
    metodo_pago: MetodoPago;
    tiempo_preparacion_min?: number;
  }) {
    const cliente = await clienteModel.getPerfil(input.clienteId);
    const preview = await this.calcularTarifaPreview({
      origen: input.origen,
      destino: input.destino,
      planCliente: cliente.plan_suscripcion,
      tipoServicio: input.tipo_servicio,
    });

    const prep =
      input.tiempo_preparacion_min ??
      (cliente.tipo_cuenta === 'particular' ? 0 : cliente.tiempo_preparacion_min || 0);
    const listoEn =
      prep > 0 ? new Date(Date.now() + prep * 60_000) : null;
    // ETA cadete = viaje + espera de preparación (si aplica)
    const tiempoTotal = preview.tiempo_estimado_min + Math.max(0, prep);

    const pool = await getPool();
    const result = await pool
      .request()
      .input('cliente', sql.UniqueIdentifier, input.clienteId)
      .input('tipo', sql.NVarChar(20), input.tipo_servicio)
      .input('odir', sql.NVarChar(500), input.origen_direccion)
      .input('olat', sql.Float, input.origen.lat)
      .input('olng', sql.Float, input.origen.lng)
      .input('ddir', sql.NVarChar(500), input.destino_direccion)
      .input('dlat', sql.Float, input.destino.lat)
      .input('dlng', sql.Float, input.destino.lng)
      .input('dist', sql.Decimal(8, 2), preview.distancia_km)
      .input('tiempo', sql.Int, tiempoTotal)
      .input('tarifa', sql.Decimal(12, 2), preview.detalle.tarifa)
      .input('comision', sql.Decimal(12, 2), preview.detalle.comision_plataforma)
      .input('pago', sql.Decimal(12, 2), preview.detalle.pago_cadete)
      .input(
        'detalle',
        sql.NVarChar(sql.MAX),
        JSON.stringify({
          ...preview.detalle,
          tipo_cuenta: cliente.tipo_cuenta,
          tiempo_preparacion_min: prep,
          tiempo_viaje_min: preview.tiempo_estimado_min,
        }),
      )
      .input('metodo', sql.NVarChar(20), input.metodo_pago)
      .input('prep', sql.Int, prep || null)
      .input('listo', sql.DateTimeOffset, listoEn)
      .query<{ id: string }>(`
        INSERT INTO viajes (
          cliente_id, tipo_servicio,
          origen_direccion, origen_lat, origen_lng,
          destino_direccion, destino_lat, destino_lng,
          distancia_km, tiempo_estimado_min,
          tarifa_estimada, tarifa_final, comision_plataforma, pago_cadete,
          detalle_tarifa, estado, metodo_pago, estado_pago,
          tiempo_preparacion_min, listo_para_retiro_en
        )
        VALUES (
          @cliente, @tipo,
          @odir, @olat, @olng,
          @ddir, @dlat, @dlng,
          @dist, @tiempo,
          @tarifa, @tarifa, @comision, @pago,
          @detalle::jsonb, 'buscando_cadete', @metodo, 'pendiente',
          @prep, @listo
        )
        RETURNING id
      `);

    const id = result.recordset[0]?.id;
    if (!id) throw new AppError('No se pudo crear el viaje', 500);

    // Sube demanda de la zona más cercana al origen (para surge)
    try {
      const haversine = geolocalizacionService.haversineMetersSql('lat_centro', 'lng_centro');
      const poolDem = await getPool();
      await poolDem
        .request()
        .input('lat', sql.Float, input.origen.lat)
        .input('lng', sql.Float, input.origen.lng)
        .query(`
          UPDATE zonas_hexagonos z
          SET demanda_actual = demanda_actual + 1
          WHERE z.activa = TRUE
            AND z.h3_index = (
              SELECT h3_index FROM zonas_hexagonos
              WHERE activa = TRUE
              ORDER BY ${haversine}
              LIMIT 1
            )
        `);
    } catch {
      /* ignore */
    }

    // Intento de asignación automática
    await this.intentarAsignar(id);

    const viaje = await this.getById(id);
    const redis = getRedis();
    if (redis) {
      await redis.publish('viajes:nuevos', JSON.stringify(viaje));
    }
    return viaje;
  }

  async intentarAsignar(viajeId: string) {
    const viaje = await this.getById(viajeId);
    if (viaje.estado !== 'buscando_cadete' && viaje.estado !== 'solicitado') return viaje;

    const disponibles = await cadeteModel.listarDisponiblesCercanos();
    const ahora = Date.now();
    const candidatos: CadeteCandidato[] = disponibles
      .filter((c) => c.ubicacion_actual)
      .map((c) => ({
        usuario_id: c.usuario_id,
        ubicacion: c.ubicacion_actual!,
        calificacion_promedio: c.calificacion_promedio,
        plan_suscripcion: c.plan_suscripcion,
        zona_actual: c.zona_actual,
        segundos_desde_update: c.ubicacion_actualizada_en
          ? Math.max(0, (ahora - new Date(c.ubicacion_actualizada_en).getTime()) / 1000)
          : 999,
      }));

    const best = asignacionService.mejorCadete(viaje.origen, candidatos, null);
    // No auto-asigna: deja ranking en Redis para ofertar
    const redis = getRedis();
    if (redis && best) {
      await redis.set(
        `viaje:${viajeId}:ranking`,
        JSON.stringify(asignacionService.rankear({ origen: viaje.origen, candidatos })),
        'EX',
        120,
      );
    }
    return { viaje, ranking: best };
  }

  async listar(filtros: {
    cliente_id?: string;
    cadete_id?: string;
    estado?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filtros.page ?? 1;
    const pageSize = filtros.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const pool = await getPool();
    const req = pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, pageSize)
      .input('cliente', sql.UniqueIdentifier, filtros.cliente_id ?? null)
      .input('cadete', sql.UniqueIdentifier, filtros.cadete_id ?? null)
      .input('estado', sql.NVarChar(30), filtros.estado ?? null);

    const result = await req.query<ViajeRow & { total: number }>(`
      SELECT COUNT(*) OVER() AS total,
             id, cliente_id, cadete_id, tipo_servicio,
             origen_direccion, origen_lat, origen_lng,
             destino_direccion, destino_lat, destino_lng,
             distancia_km, tiempo_estimado_min, tarifa_estimada, tarifa_final,
             comision_plataforma, pago_cadete, detalle_tarifa, estado, fecha_solicitud,
             tiempo_preparacion_min, listo_para_retiro_en,
             metodo_pago, estado_pago, calificacion_cliente, calificacion_cadete
      FROM viajes
      WHERE (@cliente IS NULL OR cliente_id = @cliente)
        AND (@cadete IS NULL OR cadete_id = @cadete)
        AND (@estado IS NULL OR estado = @estado)
      ORDER BY fecha_solicitud DESC
      OFFSET @offset LIMIT @limit
    `);

    return {
      items: result.recordset.map(mapViaje),
      total: Number(result.recordset[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async cancelar(viajeId: string, usuarioId: string, motivo?: string) {
    const viaje = await this.getById(viajeId);
    if (viaje.cliente_id !== usuarioId && viaje.cadete_id !== usuarioId) {
      throw new ForbiddenError('No podés cancelar este viaje');
    }
    if (['finalizado', 'cancelado'].includes(viaje.estado)) {
      throw new AppError('El viaje ya está cerrado', 400, 'VIAJE_CERRADO');
    }
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, viajeId)
      .input('motivo', sql.NVarChar(500), motivo ?? null)
      .query(`
        UPDATE viajes
        SET estado = 'cancelado',
            fecha_cancelacion = NOW(),
            motivo_cancelacion = @motivo
        WHERE id = @id
      `);
    return this.getById(viajeId);
  }

  async aceptar(viajeId: string, cadeteId: string) {
    const viaje = await this.getById(viajeId);
    if (!['buscando_cadete', 'solicitado'].includes(viaje.estado)) {
      throw new AppError('Viaje no disponible', 409, 'VIAJE_NO_DISPONIBLE');
    }
    const cadete = await cadeteModel.getById(cadeteId);
    const cliente = await clienteModel.getPerfil(viaje.cliente_id);

    const detalle = await tarifasService.calcularConConfig({
      distanciaKm: viaje.distancia_km ?? 0,
      tiempoMin: viaje.tiempo_estimado_min ?? 0,
      planCliente: cliente.plan_suscripcion,
      planCadete: cadete.plan_suscripcion,
      tipoServicio: viaje.tipo_servicio,
      origen: viaje.origen,
    });

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, viajeId)
      .input('cadete', sql.UniqueIdentifier, cadeteId)
      .input('tarifa', sql.Decimal(12, 2), detalle.tarifa)
      .input('comision', sql.Decimal(12, 2), detalle.comision_plataforma)
      .input('pago', sql.Decimal(12, 2), detalle.pago_cadete)
      .input('detalle', sql.NVarChar(sql.MAX), JSON.stringify(detalle))
      .query<{ id: string }>(`
        UPDATE viajes
        SET cadete_id = @cadete,
            estado = 'asignado',
            fecha_asignacion = NOW(),
            tarifa_final = @tarifa,
            comision_plataforma = @comision,
            pago_cadete = @pago,
            detalle_tarifa = @detalle::jsonb
        WHERE id = @id AND estado IN ('buscando_cadete', 'solicitado') AND cadete_id IS NULL
        RETURNING id
      `);

    const affected = result.recordset.length;
    if (!affected) throw new AppError('Otro cadete ya tomó el viaje', 409, 'RACE');

    await cadeteModel.setDisponibilidad(cadeteId, 'en_viaje');

    return this.getById(viajeId);
  }

  async rechazar(viajeId: string, _cadeteId: string) {
    // Soft reject: solo registra en Redis; el viaje sigue buscando
    const redis = getRedis();
    if (redis) {
      await redis.sadd(`viaje:${viajeId}:rechazos`, _cadeteId);
    }
    return { viaje_id: viajeId, rechazado: true };
  }

  async actualizarEstado(viajeId: string, cadeteId: string, estado: EstadoViaje) {
    const viaje = await this.getById(viajeId);
    if (viaje.cadete_id !== cadeteId) {
      throw new ForbiddenError('No sos el cadete asignado');
    }

    const pool = await getPool();
    const req = pool
      .request()
      .input('id', sql.UniqueIdentifier, viajeId)
      .input('estado', sql.NVarChar(30), estado);

    let extra = '';
    if (estado === 'en_curso') extra = ', fecha_inicio = NOW()';
    if (estado === 'finalizado') {
      extra = ", fecha_fin = NOW(), estado_pago = CASE WHEN metodo_pago = 'efectivo' THEN 'aprobado' ELSE estado_pago END";
    }

    await req.query(`UPDATE viajes SET estado = @estado ${extra} WHERE id = @id`);

    if (estado === 'finalizado') {
      await pool
        .request()
        .input('viaje', sql.UniqueIdentifier, viajeId)
        .input('cadete', sql.UniqueIdentifier, cadeteId)
        .query(`
          UPDATE cadetes
          SET total_viajes = total_viajes + 1,
              total_ganado = total_ganado + COALESCE((SELECT pago_cadete FROM viajes WHERE id = @viaje), 0)
          WHERE usuario_id = @cadete
        `);
      await pool
        .request()
        .input('cliente', sql.UniqueIdentifier, viaje.cliente_id)
        .query(`
          UPDATE clientes
          SET viajes_realizados = viajes_realizados + 1,
              puntos_fidelidad = puntos_fidelidad + 10
          WHERE usuario_id = @cliente
        `);
      await cadeteModel.setDisponibilidad(cadeteId, 'online');
    }

    return this.getById(viajeId);
  }

  async calificar(
    viajeId: string,
    usuarioId: string,
    rol: 'cliente' | 'cadete',
    calificacion: number,
    comentario?: string,
  ) {
    const viaje = await this.getById(viajeId);
    if (viaje.estado !== 'finalizado') {
      throw new AppError('Solo se califica un viaje finalizado', 400);
    }
    const pool = await getPool();
    if (rol === 'cliente') {
      if (viaje.cliente_id !== usuarioId) throw new ForbiddenError();
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, viajeId)
        .input('c', sql.TinyInt, calificacion)
        .input('com', sql.NVarChar(1000), comentario ?? null)
        .query(`
          UPDATE viajes
          SET calificacion_cliente = @c, comentario_cliente = @com
          WHERE id = @id
        `);
      if (viaje.cadete_id) {
        await pool
          .request()
          .input('cid', sql.UniqueIdentifier, viaje.cadete_id)
          .query(`
            UPDATE cadetes
            SET calificacion_promedio = (
              SELECT AVG(CAST(calificacion_cliente AS FLOAT))
              FROM viajes
              WHERE cadete_id = @cid AND calificacion_cliente IS NOT NULL
            )
            WHERE usuario_id = @cid
          `);
      }
    } else {
      if (viaje.cadete_id !== usuarioId) throw new ForbiddenError();
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, viajeId)
        .input('c', sql.TinyInt, calificacion)
        .input('com', sql.NVarChar(1000), comentario ?? null)
        .query(`
          UPDATE viajes
          SET calificacion_cadete = @c, comentario_cadete = @com
          WHERE id = @id
        `);
      await pool
        .request()
        .input('clid', sql.UniqueIdentifier, viaje.cliente_id)
        .query(`
          UPDATE clientes
          SET calificacion_promedio = (
            SELECT AVG(CAST(calificacion_cadete AS FLOAT))
            FROM viajes
            WHERE cliente_id = @clid AND calificacion_cadete IS NOT NULL
          )
          WHERE usuario_id = @clid
        `);
    }
    return this.getById(viajeId);
  }

  async viajesDisponiblesParaCadete(cadeteId: string) {
    const cadete = await cadeteModel.getById(cadeteId);
    const list = await this.listar({ estado: 'buscando_cadete', pageSize: 50 });
    if (!cadete.ubicacion_actual) return list.items;

    return list.items
      .map((v) => ({
        ...v,
        distancia_al_origen_km: geolocalizacionService.distanciaKm(
          cadete.ubicacion_actual!,
          v.origen,
        ),
      }))
      .sort((a, b) => a.distancia_al_origen_km - b.distancia_al_origen_km);
  }
}

export const viajeModel = new ViajeModel();

import type { Request, Response } from 'express';
import { adminModel } from '../models/admin.model.js';
import { authModel } from '../models/auth.model.js';
import { cadeteModel } from '../models/cadete.model.js';
import { clienteModel } from '../models/cliente.model.js';
import { viajeModel } from '../models/viaje.model.js';
import { comisionModel, comprobanteModel } from '../models/facturacion.model.js';
import { liquidacionModel } from '../models/liquidacion.model.js';
import { cadeteActividadModel } from '../models/cadete_actividad.model.js';
import { zonaModel } from '../models/zona.model.js';
import {
  DOC_TIPOS,
  docJsonKey,
  saveCadeteDocFromDataUrl,
  saveClienteDniFromDataUrl,
} from '../services/cadete-docs.service.js';
import {
  normalizarDireccionInput,
  resolverZonaPorBarrio,
} from '../services/direccion.service.js';
import { getPool, sql } from '../config/database.js';
import { created, ok } from '../utils/response.js';
import type { PlanCadete, PlanCliente, TipoServicio } from '../types/domain.js';

export class AdminController {
  dashboard = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.dashboard());
  };

  cadetes = async (req: Request, res: Response): Promise<void> => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 200);
    const data = await cadeteModel.listarAdmin(page, pageSize);
    ok(res, data.items, 200, { total: data.total, page, pageSize });
  };

  aprobarCadete = async (req: Request, res: Response): Promise<void> => {
    const estado = (req.body.estado as 'aprobado' | 'rechazado' | 'suspendido') ?? 'aprobado';
    ok(res, await cadeteModel.setVerificacion(req.params.id as string, estado));
  };

  crearCadete = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      email: string;
      telefono: string;
      nombre: string;
      password: string;
      dni: string;
      licencia: string;
      fecha_nacimiento: string;
      marca_moto?: string;
      patente: string;
      direccion_parts: {
        calle: string;
        numero: string;
        piso_dpto?: string | null;
        barrio: string;
        ciudad?: string;
        provincia?: string;
      };
      aprobar?: boolean;
      documentos?: {
        dni?: string;
        carnet?: string;
        seguro?: string;
        afip?: string;
        rentas?: string;
      };
    };

    const parts = normalizarDireccionInput({
      calle: body.direccion_parts.calle,
      numero: body.direccion_parts.numero,
      piso_dpto: body.direccion_parts.piso_dpto,
      barrio: body.direccion_parts.barrio,
      ciudad: body.direccion_parts.ciudad,
      provincia: body.direccion_parts.provincia,
    });
    const zona = await resolverZonaPorBarrio(parts.barrio);

    const cadete = await cadeteModel.registrar({
      email: body.email,
      telefono: body.telefono,
      nombre: body.nombre,
      password: body.password,
      dni: body.dni,
      licencia: body.licencia,
      fecha_nacimiento: body.fecha_nacimiento,
      patente: body.patente,
      marca_moto: body.marca_moto,
      direccion: parts.direccion,
      calle: parts.calle,
      numero: parts.numero,
      piso_dpto: parts.piso_dpto,
      barrio: parts.barrio,
      ciudad: parts.ciudad,
      provincia: parts.provincia,
      zona_h3: zona?.h3_index ?? null,
      datos_moto: {
        marca: body.marca_moto || undefined,
        patente: body.patente,
      },
      fotos_documentos: {},
    });

    const docs = body.documentos ?? {};
    const fotosPatch: Record<string, string> = {};
    for (const tipo of DOC_TIPOS) {
      const dataUrl = docs[tipo];
      if (!dataUrl) continue;
      const saved = saveCadeteDocFromDataUrl(cadete.usuario_id, tipo, dataUrl);
      fotosPatch[docJsonKey(tipo)] = saved.relativeUrl;
    }
    let final = Object.keys(fotosPatch).length
      ? await cadeteModel.mergeFotosDocumentos(cadete.usuario_id, fotosPatch)
      : cadete;

    if (body.aprobar !== false) {
      final = await cadeteModel.setVerificacion(final.usuario_id, 'aprobado');
    }

    created(res, final);
  };

  clientes = async (req: Request, res: Response): Promise<void> => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 200);
    const data = await clienteModel.listar(page, pageSize);
    ok(res, data.items, 200, { total: data.total, page, pageSize });
  };

  actualizarCliente = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const body = req.body as {
      nombre?: string;
      email?: string;
      telefono?: string;
      dni?: string;
      plan_suscripcion?: PlanCliente;
      tipo_cuenta?: 'particular' | 'restaurante' | 'comercio';
      tiempo_preparacion_min?: number;
      horario_comercial?: { abre?: string; cierra?: string; dias?: number[] } | null;
      direccion_parts?: {
        calle: string;
        numero: string;
        piso_dpto?: string | null;
        barrio: string;
        ciudad?: string;
        provincia?: string;
      };
      estado?: 'activo' | 'inactivo' | 'suspendido';
    };

    let zonaPatch: {
      direccion?: string;
      calle?: string;
      numero?: string;
      piso_dpto?: string | null;
      barrio?: string;
      ciudad?: string;
      provincia?: string;
      zona_h3?: string | null;
      zona_nombre?: string | null;
    } = {};

    if (body.direccion_parts) {
      const parts = normalizarDireccionInput(body.direccion_parts);
      const zona = await resolverZonaPorBarrio(parts.barrio);
      zonaPatch = {
        direccion: `${parts.calle} ${parts.numero}${parts.piso_dpto ? `, ${parts.piso_dpto}` : ''}, ${parts.barrio}`,
        calle: parts.calle,
        numero: parts.numero,
        piso_dpto: parts.piso_dpto,
        barrio: parts.barrio,
        ciudad: parts.ciudad,
        provincia: parts.provincia,
        zona_h3: zona?.h3_index ?? null,
        zona_nombre: zona?.nombre ?? parts.barrio,
      };
    }

    ok(
      res,
      await clienteModel.actualizarAdmin(id, {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        dni: body.dni,
        plan_suscripcion: body.plan_suscripcion,
        tipo_cuenta: body.tipo_cuenta,
        tiempo_preparacion_min: body.tiempo_preparacion_min,
        horario_comercial: body.horario_comercial,
        estado: body.estado,
        ...zonaPatch,
      }),
    );
  };

  bajaCliente = async (req: Request, res: Response): Promise<void> => {
    ok(res, await clienteModel.darDeBaja(req.params.id as string));
  };

  reactivarCliente = async (req: Request, res: Response): Promise<void> => {
    ok(res, await clienteModel.reactivar(req.params.id as string));
  };

  actualizarCadete = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const body = req.body as {
      nombre?: string;
      email?: string;
      telefono?: string;
      dni?: string;
      licencia?: string;
      patente?: string;
      marca_moto?: string | null;
      direccion_parts?: {
        calle: string;
        numero: string;
        piso_dpto?: string | null;
        barrio: string;
        ciudad?: string;
        provincia?: string;
      };
      cbu?: string | null;
      alias_bancario?: string | null;
      banco?: string | null;
      titular_cuenta?: string | null;
      plan_suscripcion?: PlanCadete;
      estado?: 'activo' | 'inactivo' | 'suspendido';
    };

    let dirPatch: Record<string, string | null | undefined> = {};
    if (body.direccion_parts) {
      const parts = normalizarDireccionInput(body.direccion_parts);
      dirPatch = {
        direccion: `${parts.calle} ${parts.numero}${parts.piso_dpto ? `, ${parts.piso_dpto}` : ''}, ${parts.barrio}`,
        calle: parts.calle,
        numero: parts.numero,
        piso_dpto: parts.piso_dpto,
        barrio: parts.barrio,
        ciudad: parts.ciudad,
        provincia: parts.provincia,
      };
    }

    ok(
      res,
      await cadeteModel.actualizarAdmin(id, {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        dni: body.dni,
        licencia: body.licencia,
        patente: body.patente,
        marca_moto: body.marca_moto,
        cbu: body.cbu,
        alias_bancario: body.alias_bancario,
        banco: body.banco,
        titular_cuenta: body.titular_cuenta,
        plan_suscripcion: body.plan_suscripcion,
        estado: body.estado,
        ...dirPatch,
      }),
    );
  };

  bajaCadete = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.darDeBaja(req.params.id as string));
  };

  reactivarCadete = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.reactivar(req.params.id as string));
  };

  crearCliente = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      email: string;
      telefono: string;
      nombre: string;
      password: string;
      dni: string;
      direccion_parts: {
        calle: string;
        numero: string;
        piso_dpto?: string | null;
        barrio: string;
        ciudad?: string;
        provincia?: string;
      };
      tipo_cuenta?: 'particular' | 'restaurante' | 'comercio';
      tiempo_preparacion_min?: number;
      horario_comercial?: { abre?: string; cierra?: string; dias?: number[] } | null;
      plan_suscripcion?: PlanCliente;
      documento_dni: string;
    };

    const user = await authModel.register({
      email: body.email,
      telefono: body.telefono,
      nombre: body.nombre,
      password: body.password,
      rol: 'cliente',
      dni: body.dni,
    });

    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE usuarios
        SET estado = 'activo', telefono_verificado = TRUE, email_verificado = TRUE
        WHERE id = @id
      `);

    if (body.plan_suscripcion && body.plan_suscripcion !== 'gratuito') {
      await clienteModel.actualizarPlan(user.id, body.plan_suscripcion);
    }

    const parts = normalizarDireccionInput({
      calle: body.direccion_parts.calle,
      numero: body.direccion_parts.numero,
      piso_dpto: body.direccion_parts.piso_dpto,
      barrio: body.direccion_parts.barrio,
      ciudad: body.direccion_parts.ciudad,
      provincia: body.direccion_parts.provincia,
    });
    const zona = await resolverZonaPorBarrio(parts.barrio);
    const saved = saveClienteDniFromDataUrl(user.id, body.documento_dni);
    await clienteModel.setIdentidad(user.id, {
      direccion: parts.direccion,
      calle: parts.calle,
      numero: parts.numero,
      piso_dpto: parts.piso_dpto,
      barrio: parts.barrio,
      ciudad: parts.ciudad,
      provincia: parts.provincia,
      zona_h3: zona?.h3_index ?? null,
      zona_nombre: zona?.nombre ?? null,
      zona_lat: zona?.lat_centro ?? null,
      zona_lng: zona?.lng_centro ?? null,
      dni_pdf: saved.relativeUrl,
    });

    const tipo = body.tipo_cuenta ?? 'particular';
    const prepDefault =
      body.tiempo_preparacion_min ??
      (tipo === 'restaurante' ? 25 : tipo === 'comercio' ? 15 : 0);
    const perfil = await clienteModel.setTipoCuenta(user.id, {
      tipo_cuenta: tipo,
      tiempo_preparacion_min: prepDefault,
      horario_comercial: body.horario_comercial ?? null,
    });
    created(res, perfil);
  };

  viajes = async (req: Request, res: Response): Promise<void> => {
    const data = await viajeModel.listar({
      estado: req.query.estado as string | undefined,
      page: Number(req.query.page ?? 1),
      pageSize: Number(req.query.pageSize ?? 20),
    });
    ok(res, data.items, 200, {
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
    });
  };

  despacharCercano = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const result = await viajeModel.despacharCercano(id);
    ok(res, {
      viaje_id: id,
      candidatos: result.ranking_total ?? 0,
      top: result.ranking
        ? {
            cadete_id: result.ranking.cadete_id,
            score: result.ranking.score,
            distancia_km: result.ranking.distancia_km,
          }
        : null,
      mensaje:
        (result.ranking_total ?? 0) > 0
          ? 'Oferta reenviada a cadetes cercanos. Ellos deben aceptar el viaje.'
          : 'No hay cadetes online cercanos. Revisá disponibilidad.',
    });
  };

  reportes = async (req: Request, res: Response): Promise<void> => {
    const dias = Number(req.query.dias ?? 30);
    const tiposRaw = String(req.query.tipos ?? '');
    const metodosRaw = String(req.query.metodos ?? '');
    const zonasRaw = String(req.query.zonas ?? '');
    const franjasRaw = String(req.query.franjas ?? '');
    const split = (raw: string) =>
      raw
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    ok(
      res,
      await adminModel.reportes({
        dias: Number.isFinite(dias) ? dias : 30,
        tipos: split(tiposRaw),
        metodos: split(metodosRaw),
        zonas: split(zonasRaw),
        franjas: split(franjasRaw),
        cadete_id: (req.query.cadete_id as string) || null,
        cliente_id: (req.query.cliente_id as string) || null,
      }),
    );
  };

  guardarReporte = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      tipo: string;
      titulo: string;
      periodo_desde?: string;
      periodo_hasta?: string;
      resumen: Record<string, unknown>;
      detalle: Record<string, unknown>;
    };
    created(
      res,
      await adminModel.guardarReporte({
        ...body,
        generado_por: req.user?.sub ?? null,
      }),
    );
  };

  listarReportesGuardados = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.listarReportesGuardados());
  };

  getReporteGuardado = async (req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.getReporteGuardado(req.params.id as string));
  };

  getTarifas = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.getTarifasBase());
  };

  configurarTarifas = async (req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.setTarifasBase(req.body));
  };

  getPlanes = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.getPlanes());
  };

  setPlanes = async (req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.setPlanes(req.body));
  };

  listarZonas = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await zonaModel.listar(true));
  };

  crearZona = async (req: Request, res: Response): Promise<void> => {
    created(res, await zonaModel.crear(req.body));
  };

  actualizarZona = async (req: Request, res: Response): Promise<void> => {
    ok(res, await zonaModel.actualizar(req.params.id as string, req.body));
  };

  bajaZona = async (req: Request, res: Response): Promise<void> => {
    ok(res, await zonaModel.darDeBaja(req.params.id as string));
  };

  incidencias = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.listarIncidencias());
  };

  actualizarIncidencia = async (req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.actualizarIncidencia(req.params.id as string, req.body));
  };

  listarComisiones = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await comisionModel.listar());
  };

  guardarComisiones = async (req: Request, res: Response): Promise<void> => {
    const items = (req.body as {
      items: Array<{
        plan_cadete: PlanCadete;
        tipo_servicio: TipoServicio;
        comision_pct: number;
      }>;
    }).items;
    ok(res, await comisionModel.upsertMany(items));
  };

  comprobantesViaje = async (req: Request, res: Response): Promise<void> => {
    ok(res, await comprobanteModel.listarPorViaje(req.params.id as string));
  };

  listarComprobantes = async (req: Request, res: Response): Promise<void> => {
    const q = req.query as {
      rol?: 'cliente' | 'cadete';
      q?: string;
      desde?: string;
      hasta?: string;
      tipo_servicio?: string;
      page?: string;
      pageSize?: string;
    };
    const data = await comprobanteModel.listarAdmin({
      rol: q.rol,
      q: q.q,
      desde: q.desde,
      hasta: q.hasta,
      tipo_servicio: q.tipo_servicio,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
    });
    ok(res, data);
  };

  comprobanteById = async (req: Request, res: Response): Promise<void> => {
    ok(res, await comprobanteModel.getById(req.params.id as string));
  };

  detalleCliente = async (req: Request, res: Response): Promise<void> => {
    ok(res, await clienteModel.detalleAdmin(req.params.id as string));
  };

  detalleCadete = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.detalleAdmin(req.params.id as string));
  };

  liquidaciones = async (req: Request, res: Response): Promise<void> => {
    ok(
      res,
      await liquidacionModel.listar({
        estado: req.query.estado as string | undefined,
        cadete_id: req.query.cadete_id as string | undefined,
      }),
    );
  };

  transferirLiquidacion = async (req: Request, res: Response): Promise<void> => {
    ok(
      res,
      await liquidacionModel.marcarTransferida(
        req.params.id as string,
        (req.body as { nota?: string }).nota,
      ),
    );
  };

  plazoLiquidacion = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await liquidacionModel.getPlazo());
  };

  setPlazoLiquidacion = async (req: Request, res: Response): Promise<void> => {
    ok(res, await liquidacionModel.setPlazo(Number((req.body as { dias: number }).dias)));
  };

  actividadCadetes = async (req: Request, res: Response): Promise<void> => {
    const q = req.query as { desde?: string; hasta?: string; cadete_id?: string };
    const hoy = new Date();
    const hastaDefault = hoy.toISOString();
    const desdeDefault = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    ok(
      res,
      await cadeteActividadModel.estadisticas({
        desde: q.desde ?? desdeDefault,
        hasta: q.hasta ?? hastaDefault,
        cadete_id: q.cadete_id,
      }),
    );
  };

  subirDocumentosCadete = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    await cadeteModel.getById(id);
    const body = req.body as {
      documentos?: Partial<Record<(typeof DOC_TIPOS)[number], string>>;
      direccion?: string;
    };
    if (body.direccion != null) {
      await cadeteModel.setDireccion(id, body.direccion.trim() || null);
    }
    const docs = body.documentos ?? {};
    const fotosPatch: Record<string, string> = {};
    for (const tipo of DOC_TIPOS) {
      const dataUrl = docs[tipo];
      if (!dataUrl) continue;
      const saved = saveCadeteDocFromDataUrl(id, tipo, dataUrl);
      fotosPatch[docJsonKey(tipo)] = saved.relativeUrl;
    }
    const final = Object.keys(fotosPatch).length
      ? await cadeteModel.mergeFotosDocumentos(id, fotosPatch)
      : await cadeteModel.getById(id);
    ok(res, final);
  };
}

export const adminController = new AdminController();

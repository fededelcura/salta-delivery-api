import type { Request, Response } from 'express';
import { cadeteModel } from '../models/cadete.model.js';
import { viajeModel } from '../models/viaje.model.js';
import { adminModel } from '../models/admin.model.js';
import { authModel } from '../models/auth.model.js';
import { ok, created } from '../utils/response.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { PlanCadete } from '../types/domain.js';
import { emitViajeEstado, emitCadeteUbicacion } from '../sockets/index.js';
import { facturacionService } from '../services/facturacion.service.js';
import { comprobanteModel } from '../models/facturacion.model.js';

function uid(req: Request): string {
  if (!req.user?.sub) throw new UnauthorizedError();
  return req.user.sub;
}

export class CadeteController {
  registrar = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      patente?: string;
      marca_moto?: string;
      datos_moto?: { patente?: string; marca?: string };
    };
    const cadete = await cadeteModel.registrar({
      ...req.body,
      patente: body.patente || body.datos_moto?.patente || '',
      marca_moto: body.marca_moto || body.datos_moto?.marca,
    });
    await authModel.issueEmailVerification(
      cadete.usuario_id,
      cadete.email ?? req.body.email,
    );
    created(res, {
      requiresEmailVerification: true,
      email: cadete.email ?? req.body.email,
      cadete,
    });
  };

  estado = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.setDisponibilidad(uid(req), req.body.disponibilidad));
  };

  viajesDisponibles = async (req: Request, res: Response): Promise<void> => {
    ok(res, await viajeModel.viajesDisponiblesParaCadete(uid(req)));
  };

  aceptarViaje = async (req: Request, res: Response): Promise<void> => {
    const viaje = await viajeModel.aceptar(req.params.id as string, uid(req));
    emitViajeEstado(viaje.id, viaje.estado, uid(req));
    ok(res, viaje);
  };

  rechazarViaje = async (req: Request, res: Response): Promise<void> => {
    ok(res, await viajeModel.rechazar(req.params.id as string, uid(req)));
  };

  actualizarUbicacion = async (req: Request, res: Response): Promise<void> => {
    const cadete = await cadeteModel.actualizarUbicacion(
      uid(req),
      req.body.lat,
      req.body.lng,
      req.body.zona_h3,
    );
    emitCadeteUbicacion({
      cadete_id: uid(req),
      lat: req.body.lat,
      lng: req.body.lng,
      disponibilidad: cadete.disponibilidad,
    });
    ok(res, cadete);
  };

  estadoViaje = async (req: Request, res: Response): Promise<void> => {
    const viaje = await viajeModel.actualizarEstado(
      req.params.id as string,
      uid(req),
      req.body.estado,
    );
    emitViajeEstado(viaje.id, viaje.estado, uid(req));
    if (viaje.estado === 'finalizado') {
      try {
        await facturacionService.emitirAlFinalizar(viaje.id);
      } catch (err) {
        console.error('[facturacion] emitirAlFinalizar', viaje.id, err);
      }
    }
    ok(res, await viajeModel.getById(viaje.id));
  };

  ganancias = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.ganancias(uid(req)));
  };

  suscripcion = async (req: Request, res: Response): Promise<void> => {
    const cadete = await cadeteModel.getById(uid(req));
    ok(res, {
      actual: {
        plan: cadete.plan_suscripcion,
        estado: cadete.estado_suscripcion,
        comision_actual: cadete.comision_actual,
      },
      planes: adminModel.planes().cadete,
    });
  };

  cambiarPlan = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.actualizarPlan(uid(req), req.body.plan as PlanCadete));
  };

  reportarIncidencia = async (req: Request, res: Response): Promise<void> => {
    ok(
      res,
      await adminModel.crearIncidencia({
        ...req.body,
        usuario_reporta: uid(req),
      }),
      201,
    );
  };

  comprobantes = async (req: Request, res: Response): Promise<void> => {
    ok(res, await comprobanteModel.listarPorUsuario(uid(req)));
  };

  comprobanteById = async (req: Request, res: Response): Promise<void> => {
    ok(res, await comprobanteModel.getById(req.params.id as string, uid(req)));
  };

  comprobantesViaje = async (req: Request, res: Response): Promise<void> => {
    const list = await comprobanteModel.listarPorViaje(req.params.id as string);
    ok(
      res,
      list.filter((c) => c.usuario_id === uid(req)),
    );
  };

  datosCobro = async (req: Request, res: Response): Promise<void> => {
    ok(res, await cadeteModel.actualizarDatosCobro(uid(req), req.body));
  };

  perfilCobro = async (req: Request, res: Response): Promise<void> => {
    const c = await cadeteModel.getById(uid(req));
    ok(res, {
      cbu: c.cbu,
      alias_bancario: c.alias_bancario,
      banco: c.banco,
      titular_cuenta: c.titular_cuenta,
      comision_actual: c.comision_actual,
      total_ganado: c.total_ganado,
    });
  };
}

export const cadeteController = new CadeteController();

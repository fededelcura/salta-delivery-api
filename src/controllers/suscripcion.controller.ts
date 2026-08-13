import type { Request, Response } from 'express';
import { adminModel } from '../models/admin.model.js';
import { clienteModel } from '../models/cliente.model.js';
import { cadeteModel } from '../models/cadete.model.js';
import { ok } from '../utils/response.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { PlanCadete, PlanCliente } from '../types/domain.js';

function uid(req: Request): string {
  if (!req.user?.sub) throw new UnauthorizedError();
  return req.user.sub;
}

export class SuscripcionController {
  planes = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await adminModel.getPlanes());
  };

  miPlan = async (req: Request, res: Response): Promise<void> => {
    const rol = req.user?.rol;
    if (rol === 'cliente') {
      const p = await clienteModel.getPerfil(uid(req));
      ok(res, {
        tipo: 'cliente',
        plan: p.plan_suscripcion,
        estado: p.estado_suscripcion,
        fechas: {
          inicio: p.fecha_inicio_suscripcion,
          fin: p.fecha_fin_suscripcion,
        },
      });
      return;
    }
    if (rol === 'cadete') {
      const c = await cadeteModel.getById(uid(req));
      ok(res, {
        tipo: 'cadete',
        plan: c.plan_suscripcion,
        estado: c.estado_suscripcion,
        comision_actual: c.comision_actual,
      });
      return;
    }
    ok(res, { tipo: 'administrador', plan: null });
  };

  cambiarPlan = async (req: Request, res: Response): Promise<void> => {
    if (req.user?.rol === 'cliente') {
      ok(res, await clienteModel.actualizarPlan(uid(req), req.body.plan as PlanCliente));
      return;
    }
    if (req.user?.rol === 'cadete') {
      ok(res, await cadeteModel.actualizarPlan(uid(req), req.body.plan as PlanCadete));
      return;
    }
    ok(res, { message: 'Rol sin suscripción' });
  };

  cancelar = async (req: Request, res: Response): Promise<void> => {
    if (req.user?.rol === 'cliente') {
      ok(res, await clienteModel.actualizarPlan(uid(req), 'gratuito'));
      return;
    }
    if (req.user?.rol === 'cadete') {
      ok(res, await cadeteModel.actualizarPlan(uid(req), 'trial'));
      return;
    }
    ok(res, { cancelled: false });
  };
}

export const suscripcionController = new SuscripcionController();

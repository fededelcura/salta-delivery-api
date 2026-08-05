import type { Request, Response } from 'express';
import { viajeModel } from '../models/viaje.model.js';
import { ok } from '../utils/response.js';
import type { PlanCadete, PlanCliente } from '../types/domain.js';

export class ViajeController {
  getById = async (req: Request, res: Response): Promise<void> => {
    ok(res, await viajeModel.getById(req.params.id as string));
  };

  listar = async (req: Request, res: Response): Promise<void> => {
    const q = req.query as {
      estado?: string;
      cliente_id?: string;
      cadete_id?: string;
      page?: number;
      pageSize?: number;
    };
    const data = await viajeModel.listar(q);
    ok(res, data.items, 200, {
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
    });
  };

  calcularTarifa = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      origen: { lat: number; lng: number };
      destino: { lat: number; lng: number };
      plan_cliente?: PlanCliente;
      plan_cadete?: PlanCadete;
      zona_multiplier?: number;
      demanda_multiplier?: number;
    };
    const preview = await viajeModel.calcularTarifaPreview({
      origen: body.origen,
      destino: body.destino,
      planCliente: body.plan_cliente,
      planCadete: body.plan_cadete,
      zonaMultiplier: body.zona_multiplier,
      demandaMultiplier: body.demanda_multiplier,
    });
    ok(res, preview);
  };
}

export const viajeController = new ViajeController();

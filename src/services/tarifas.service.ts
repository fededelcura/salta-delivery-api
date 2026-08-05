/**
 * tarifas.service.ts
 * Fórmula: (500 + dist*350 + tiempo*100) * mults * (1 - desc_cliente)
 * Comisión: % configurable (plan × tipo) o override explícito.
 */

import type { DetalleTarifa, PlanCadete, PlanCliente, TipoServicio } from '../types/domain.js';
import { comisionModel } from '../models/facturacion.model.js';
import { multiplicadoresService } from './multiplicadores.service.js';
import type { Coordenada } from '../types/domain.js';

export interface TarifasBaseConfig {
  base_fija: number;
  precio_km: number;
  precio_minuto: number;
}

export interface MultiplicadoresInput {
  clima?: number;
  hora?: number;
  zona?: number;
  demanda?: number;
}

const PLAN_DESCUENTO: Record<PlanCliente, number> = {
  gratuito: 0,
  basico: 10,
  plus: 20,
  business: 30,
};

const PLAN_COMISION: Record<PlanCadete, number> = {
  trial: 15,
  silver: 13,
  gold: 10,
  premium: 8,
};

const DEFAULT_BASE: TarifasBaseConfig = {
  base_fija: 500,
  precio_km: 350,
  precio_minuto: 100,
};

export class TarifasService {
  constructor(private readonly base: TarifasBaseConfig = DEFAULT_BASE) {}

  descuentoCliente(plan: PlanCliente): number {
    return PLAN_DESCUENTO[plan];
  }

  comisionCadete(plan: PlanCadete): number {
    return PLAN_COMISION[plan];
  }

  calcular(params: {
    distanciaKm: number;
    tiempoMin: number;
    planCliente: PlanCliente;
    planCadete?: PlanCadete;
    multiplicadores?: MultiplicadoresInput;
    /** Si viene, manda sobre el default del plan */
    comision_pct?: number;
  }): DetalleTarifa {
    const {
      distanciaKm,
      tiempoMin,
      planCliente,
      planCadete = 'trial',
      multiplicadores = {},
      comision_pct: comisionOverride,
    } = params;

    const dist = Math.max(0, distanciaKm);
    const tiempo = Math.max(0, tiempoMin);

    const costoDistancia = dist * this.base.precio_km;
    const costoTiempo = tiempo * this.base.precio_minuto;
    const subtotal = this.base.base_fija + costoDistancia + costoTiempo;

    const mult_clima = multiplicadores.clima ?? 1;
    const mult_hora = multiplicadores.hora ?? 1;
    const mult_zona = multiplicadores.zona ?? 1;
    const mult_demanda = multiplicadores.demanda ?? 1;

    const descuento_plan_pct = this.descuentoCliente(planCliente);
    const factorDesc = 1 - descuento_plan_pct / 100;

    const tarifa =
      Math.round(
        subtotal * mult_clima * mult_hora * mult_zona * mult_demanda * factorDesc * 100,
      ) / 100;

    const comision_pct = comisionOverride ?? this.comisionCadete(planCadete);
    const comision_plataforma = Math.round(((tarifa * comision_pct) / 100) * 100) / 100;
    const pago_cadete = Math.round((tarifa - comision_plataforma) * 100) / 100;

    return {
      base_fija: this.base.base_fija,
      distancia: Math.round(costoDistancia * 100) / 100,
      tiempo: Math.round(costoTiempo * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      mult_clima,
      mult_hora,
      mult_zona,
      mult_demanda,
      descuento_plan_pct,
      tarifa,
      comision_pct,
      comision_plataforma,
      pago_cadete,
    };
  }

  async calcularConConfig(params: {
    distanciaKm: number;
    tiempoMin: number;
    planCliente: PlanCliente;
    planCadete?: PlanCadete;
    tipoServicio?: TipoServicio;
    multiplicadores?: MultiplicadoresInput;
    /** Si hay origen, resuelve hora/zona/demanda automáticamente */
    origen?: Coordenada;
    at?: Date;
  }): Promise<DetalleTarifa & {
    franja_hora?: string;
    zona_nombre?: string | null;
    demanda_nivel?: string;
    multiplicadores_explicacion?: string[];
  }> {
    const planCadete = params.planCadete ?? 'trial';
    const tipo = params.tipoServicio ?? 'delivery';
    let comision_pct: number;
    try {
      comision_pct = await comisionModel.getPct(planCadete, tipo);
    } catch {
      comision_pct = this.comisionCadete(planCadete);
    }

    let multiplicadores = params.multiplicadores ?? {};
    let meta: {
      franja_hora?: string;
      zona_nombre?: string | null;
      demanda_nivel?: string;
      multiplicadores_explicacion?: string[];
    } = {};

    if (params.origen) {
      const auto = await multiplicadoresService.resolver({
        origen: params.origen,
        at: params.at,
        clima: multiplicadores.clima,
      });
      multiplicadores = {
        clima: auto.clima,
        hora: params.multiplicadores?.hora ?? auto.hora,
        zona: params.multiplicadores?.zona ?? auto.zona,
        demanda: params.multiplicadores?.demanda ?? auto.demanda,
      };
      meta = {
        franja_hora: auto.franja_hora,
        zona_nombre: auto.zona_nombre,
        demanda_nivel: auto.demanda_nivel,
        multiplicadores_explicacion: auto.explicacion,
      };
    }

    const detalle = this.calcular({ ...params, planCadete, comision_pct, multiplicadores });
    return { ...detalle, ...meta };
  }
}

export const tarifasService = new TarifasService();

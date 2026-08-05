/**
 * asignacion.service.ts
 * Score = distancia 30% + tiempo 20% + calificación 15% + zona 10% + suscripción 15% + disp 10%
 */

import type { Coordenada, PlanCadete, ScoreAsignacion } from '../types/domain.js';
import { geolocalizacionService } from './geolocalizacion.service.js';

export interface CadeteCandidato {
  usuario_id: string;
  ubicacion: Coordenada;
  calificacion_promedio: number;
  plan_suscripcion: PlanCadete;
  zona_actual: string | null;
  /** segundos desde última actualización GPS */
  segundos_desde_update: number;
}

export interface PesosAsignacion {
  distancia: number;
  tiempo_respuesta: number;
  calificacion: number;
  zona: number;
  suscripcion: number;
  disponibilidad_reciente: number;
}

const DEFAULT_PESOS: PesosAsignacion = {
  distancia: 0.3,
  tiempo_respuesta: 0.2,
  calificacion: 0.15,
  zona: 0.1,
  suscripcion: 0.15,
  disponibilidad_reciente: 0.1,
};

const PLAN_SCORE: Record<PlanCadete, number> = {
  trial: 0.4,
  silver: 0.6,
  gold: 0.8,
  premium: 1.0,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export class AsignacionService {
  constructor(private readonly pesos: PesosAsignacion = DEFAULT_PESOS) {}

  rankear(params: {
    origen: Coordenada;
    zonaOrigenH3?: string | null;
    candidatos: CadeteCandidato[];
    radioMaxKm?: number;
  }): ScoreAsignacion[] {
    const { origen, zonaOrigenH3, candidatos, radioMaxKm = 12 } = params;
    const scored: ScoreAsignacion[] = [];

    for (const c of candidatos) {
      const distancia_km = geolocalizacionService.distanciaKm(origen, c.ubicacion);
      if (distancia_km > radioMaxKm) continue;

      const sDist = clamp01(1 - distancia_km / radioMaxKm);
      const sTiempo = clamp01(1 - c.segundos_desde_update / 120);
      const sCal = clamp01((c.calificacion_promedio - 1) / 4);
      const sZona =
        zonaOrigenH3 && c.zona_actual && zonaOrigenH3 === c.zona_actual ? 1 : 0.5;
      const sSub = PLAN_SCORE[c.plan_suscripcion];
      const sDisp = sTiempo;

      const score =
        sDist * this.pesos.distancia +
        sTiempo * this.pesos.tiempo_respuesta +
        sCal * this.pesos.calificacion +
        sZona * this.pesos.zona +
        sSub * this.pesos.suscripcion +
        sDisp * this.pesos.disponibilidad_reciente;

      scored.push({
        cadete_id: c.usuario_id,
        score: Math.round(score * 1000) / 1000,
        distancia_km,
        desglose: {
          distancia: Math.round(sDist * 1000) / 1000,
          tiempo_respuesta: Math.round(sTiempo * 1000) / 1000,
          calificacion: Math.round(sCal * 1000) / 1000,
          zona: Math.round(sZona * 1000) / 1000,
          suscripcion: Math.round(sSub * 1000) / 1000,
          disponibilidad_reciente: Math.round(sDisp * 1000) / 1000,
        },
      });
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  mejorCadete(
    origen: Coordenada,
    candidatos: CadeteCandidato[],
    zonaOrigenH3?: string | null,
  ): ScoreAsignacion | null {
    return this.rankear({ origen, candidatos, zonaOrigenH3 })[0] ?? null;
  }
}

export const asignacionService = new AsignacionService();

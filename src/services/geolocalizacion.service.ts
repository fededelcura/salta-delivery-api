/**
 * geolocalizacion.service.ts
 * Distancia Haversine + ETA. Compatible con GEOGRAPHY SQL Server (SRID 4326).
 */

import type { Coordenada } from '../types/domain.js';

const EARTH_RADIUS_KM = 6371;
const DEFAULT_SPEED_KMH = 25; // moto urbana Salta

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export class GeolocalizacionService {
  constructor(private readonly velocidadPromedioKmh = DEFAULT_SPEED_KMH) {}

  /** Distancia en km entre dos puntos WGS84 */
  distanciaKm(a: Coordenada, b: Coordenada): number {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    return Math.round(km * 1000) / 1000;
  }

  /** ETA en minutos (aprox. sin tráfico) */
  etaMinutos(distanciaKm: number, velocidadKmh = this.velocidadPromedioKmh): number {
    if (velocidadKmh <= 0) return 0;
    return Math.max(1, Math.ceil((distanciaKm / velocidadKmh) * 60));
  }

  /** WKT Point para SQL Server: POINT(lng lat) — Ojo: WKT es lng lat */
  toWktPoint(c: Coordenada): string {
    return `POINT(${c.lng} ${c.lat})`;
  }

  /** Expresión T-SQL geography::Point(lat, lng, 4326) */
  toSqlPointExpression(c: Coordenada): string {
    return `geography::Point(${c.lat}, ${c.lng}, 4326)`;
  }
}

export const geolocalizacionService = new GeolocalizacionService();

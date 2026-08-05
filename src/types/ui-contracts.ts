/**
 * Catálogo visual de interfaces — contrato Web Admin + Mobile.
 * Este archivo no se importa en runtime; documenta el shape de datos.
 *
 * Abrilo en el IDE o en la app para alinear pantallas de Fase 3–5.
 */

import type {
  AuthSession,
  ApiSuccess,
  ApiErrorBody,
  PlanInfoCliente,
  PlanInfoCadete,
} from './api.js';
import type {
  Usuario,
  Cliente,
  Cadete,
  Viaje,
  DetalleTarifa,
  DashboardKpis,
  ScoreAsignacion,
  Suscripcion,
  Incidencia,
  Coordenada,
} from './domain.js';

/** Pantalla Login — respuesta */
export type LoginResponse = ApiSuccess<AuthSession>;

/** Pantalla Registro */
export type RegisterResponse = ApiSuccess<AuthSession>;

/** Pantalla Perfil Cliente */
export type PerfilClienteResponse = ApiSuccess<
  Cliente & Pick<Usuario, 'email' | 'telefono' | 'nombre' | 'estado'>
>;

/** Pantalla Mapa / Solicitar viaje — preview tarifa */
export interface CalcularTarifaData {
  distancia_km: number;
  tiempo_estimado_min: number;
  detalle: DetalleTarifa;
}
export type CalcularTarifaResponse = ApiSuccess<CalcularTarifaData>;

/** Pantalla Seguimiento */
export type ViajeResponse = ApiSuccess<Viaje>;

/** Lista historial */
export type ViajesListResponse = ApiSuccess<Viaje[]>;

/** Cadete online — ubicación en mapa */
export interface CadeteUbicacionEvent {
  cadete_id: string;
  viaje_id?: string;
  lat: number;
  lng: number;
  ts: string;
}

/** Matching interno (no siempre expuesto) */
export type RankingAsignacion = ScoreAsignacion[];

/** Dashboard Admin (Fase 3) */
export type DashboardResponse = ApiSuccess<DashboardKpis>;

/** Suscripciones (cliente o cadete) */
export interface PlanesCatalogo {
  cliente: PlanInfoCliente[];
  cadete: PlanInfoCadete[];
}
export type PlanesResponse = ApiSuccess<PlanesCatalogo>;

/** Error uniforme en todas las pantallas */
export type ErrorResponse = ApiErrorBody;

/** Helpers de formularios mobile */
export interface SolicitarViajeForm {
  origen: Coordenada & { direccion: string };
  destino: Coordenada & { direccion: string };
  tipo_servicio: 'delivery' | 'mensajeria' | 'envio_paquete';
  metodo_pago: 'efectivo' | 'mercadopago' | 'tarjeta' | 'billetera';
}

export type { Usuario, Cliente, Cadete, Viaje, Suscripcion, Incidencia, DetalleTarifa };

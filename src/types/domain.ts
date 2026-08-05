/**
 * Interfaces de dominio — Salta Delivery API
 * Contrato compartido conceptualmente con Web Admin y apps Mobile.
 */

/** Roles de la plataforma */
export type RolUsuario = 'cliente' | 'cadete' | 'administrador';

export type EstadoUsuario =
  | 'activo'
  | 'inactivo'
  | 'suspendido'
  | 'pendiente_verificacion';

export type PlanCliente = 'gratuito' | 'basico' | 'plus' | 'business';
export type TipoCuentaCliente = 'particular' | 'restaurante' | 'comercio';
export type PlanCadete = 'trial' | 'silver' | 'gold' | 'premium';

export type EstadoSuscripcion =
  | 'activa'
  | 'cancelada'
  | 'vencida'
  | 'pendiente_pago'
  | 'trial';

export type EstadoVerificacionCadete =
  | 'pendiente'
  | 'en_revision'
  | 'aprobado'
  | 'rechazado'
  | 'suspendido';

export type DisponibilidadCadete = 'online' | 'offline' | 'en_viaje' | 'ocupado';

export type TipoServicio = 'delivery' | 'mensajeria' | 'envio_paquete';

export type EstadoViaje =
  | 'solicitado'
  | 'buscando_cadete'
  | 'asignado'
  | 'cadete_en_camino'
  | 'cadete_llego'
  | 'en_curso'
  | 'finalizado'
  | 'cancelado';

export type MetodoPago = 'efectivo' | 'mercadopago' | 'tarjeta' | 'billetera';

export type EstadoPago =
  | 'pendiente'
  | 'procesando'
  | 'aprobado'
  | 'rechazado'
  | 'reembolsado'
  | 'cancelado';

export type TipoPago = 'viaje' | 'suscripcion' | 'comision' | 'reembolso' | 'ajuste';

export type TipoIncidencia =
  | 'accidente'
  | 'demora'
  | 'paquete_danado'
  | 'paquete_perdido'
  | 'comportamiento'
  | 'pago'
  | 'tecnico'
  | 'otro';

export type NivelIncidencia = 'bajo' | 'medio' | 'alto' | 'critico';
export type EstadoIncidencia =
  | 'abierta'
  | 'en_proceso'
  | 'resuelta'
  | 'cerrada'
  | 'escalada';

/** Coordenada WGS84 (SQL Server geography::Point usa lat, lng) */
export interface Coordenada {
  lat: number;
  lng: number;
}

export interface DireccionFavorita {
  alias: string;
  direccion: string;
  lat: number;
  lng: number;
  es_principal?: boolean;
}

/** Partes de domicilio (cliente / cadete) */
export interface DireccionEstructurada {
  calle: string;
  numero: string;
  piso_dpto: string | null;
  barrio: string;
  ciudad: string;
  provincia: string;
}

export interface DatosMoto {
  marca?: string;
  modelo?: string;
  patente?: string;
  color?: string;
  anio?: number;
}

export interface FotosDocumentos {
  dni_frente?: string;
  dni_dorso?: string;
  licencia?: string;
  selfie?: string;
  foto_moto?: string;
  seguro?: string;
  /** PDFs / archivos de alta */
  dni_pdf?: string;
  carnet_pdf?: string;
  seguro_pdf?: string;
  afip_pdf?: string;
  rentas_pdf?: string;
}

export interface Usuario {
  id: string;
  numero_usuario: number;
  email: string;
  telefono: string;
  nombre: string;
  rol: RolUsuario;
  estado: EstadoUsuario;
  telefono_verificado: boolean;
  fecha_registro: string;
}

export interface Cliente {
  usuario_id: string;
  numero_usuario: number;
  dni: string;
  plan_suscripcion: PlanCliente;
  tipo_cuenta: TipoCuentaCliente;
  tiempo_preparacion_min: number;
  horario_comercial: { abre?: string; cierra?: string; dias?: number[] } | null;
  estado_suscripcion: EstadoSuscripcion;
  fecha_inicio_suscripcion: string | null;
  fecha_fin_suscripcion: string | null;
  /** Texto armado completo */
  direccion: string | null;
  calle: string | null;
  numero: string | null;
  piso_dpto: string | null;
  barrio: string | null;
  ciudad: string | null;
  provincia: string | null;
  zona_h3: string | null;
  zona_nombre: string | null;
  direcciones_favoritas: DireccionFavorita[];
  metodo_pago_preferido: MetodoPago;
  viajes_realizados: number;
  calificacion_promedio: number;
  puntos_fidelidad: number;
  /** Solo DNI para identidad: { dni_pdf?: string } */
  fotos_documentos: { dni_pdf?: string; [k: string]: string | undefined };
}

export interface Cadete {
  usuario_id: string;
  numero_usuario: number;
  dni: string;
  licencia: string;
  patente: string;
  marca_moto: string | null;
  fecha_nacimiento: string;
  estado_verificacion: EstadoVerificacionCadete;
  disponibilidad: DisponibilidadCadete;
  ubicacion_actual: Coordenada | null;
  ubicacion_actualizada_en: string | null;
  zona_actual: string | null;
  plan_suscripcion: PlanCadete;
  estado_suscripcion: EstadoSuscripcion;
  comision_actual: number;
  total_viajes: number;
  total_ganado: number;
  calificacion_promedio: number;
  datos_moto: DatosMoto;
  fotos_documentos: FotosDocumentos;
  /** Texto armado completo */
  direccion: string | null;
  calle: string | null;
  numero: string | null;
  piso_dpto: string | null;
  barrio: string | null;
  ciudad: string | null;
  provincia: string | null;
  cbu: string | null;
  alias_bancario: string | null;
  banco: string | null;
  titular_cuenta: string | null;
}

export interface DetalleTarifa {
  base_fija: number;
  distancia: number;
  tiempo: number;
  subtotal: number;
  mult_clima: number;
  mult_hora: number;
  mult_zona: number;
  mult_demanda: number;
  descuento_plan_pct: number;
  tarifa: number;
  comision_pct: number;
  comision_plataforma: number;
  pago_cadete: number;
}

export interface Viaje {
  id: string;
  cliente_id: string;
  cadete_id: string | null;
  tipo_servicio: TipoServicio;
  origen_direccion: string;
  origen: Coordenada;
  destino_direccion: string;
  destino: Coordenada;
  distancia_km: number | null;
  tiempo_estimado_min: number | null;
  tarifa_estimada: number | null;
  tarifa_final: number | null;
  comision_plataforma: number | null;
  pago_cadete: number | null;
  detalle_tarifa: DetalleTarifa | null;
  estado: EstadoViaje;
  fecha_solicitud: string;
  tiempo_preparacion_min: number | null;
  listo_para_retiro_en: string | null;
  metodo_pago: MetodoPago;
  estado_pago: EstadoPago;
  calificacion_cliente: number | null;
  calificacion_cadete: number | null;
}

export interface Suscripcion {
  id: string;
  usuario_id: string;
  tipo_usuario: 'cliente' | 'cadete';
  plan: string;
  estado: EstadoSuscripcion;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  monto_mensual: number;
  beneficios: Record<string, unknown>;
  renovacion_auto: boolean;
}

export interface Pago {
  id: string;
  usuario_id: string;
  viaje_id: string | null;
  suscripcion_id: string | null;
  tipo: TipoPago;
  monto: number;
  moneda: string;
  metodo_pago: MetodoPago;
  estado: EstadoPago;
  transaccion_id: string | null;
  fecha_pago: string | null;
  factura_url: string | null;
}

export interface Incidencia {
  id: string;
  viaje_id: string | null;
  usuario_reporta: string;
  tipo: TipoIncidencia;
  nivel: NivelIncidencia;
  descripcion: string;
  estado: EstadoIncidencia;
  asignado_a: string | null;
}

export interface ZonaHexagono {
  id: string;
  h3_index: string;
  tipo: string;
  lat_centro: number;
  lng_centro: number;
  tarifa_multiplier: number;
  demanda_actual: number;
  activa: boolean;
  nombre: string | null;
}

export interface Notificacion {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  data: Record<string, unknown>;
  fecha: string;
}

/** Payload JWT */
export interface JwtPayload {
  sub: string;
  email: string;
  rol: RolUsuario;
  iat?: number;
  exp?: number;
}

/** Score del algoritmo de asignación */
export interface ScoreAsignacion {
  cadete_id: string;
  score: number;
  distancia_km: number;
  desglose: {
    distancia: number;
    tiempo_respuesta: number;
    calificacion: number;
    zona: number;
    suscripcion: number;
    disponibilidad_reciente: number;
  };
}

/** KPIs dashboard admin */
export interface DashboardKpis {
  viajes_hoy: number;
  viajes_activos: number;
  cadetes_online: number;
  clientes_activos: number;
  /** Personas (tipo particular) */
  usuarios_activos: number;
  /** Restaurantes + comercios */
  negocios_activos: number;
  restaurantes_activos: number;
  comercios_activos: number;
  ingresos_hoy: number;
  comisiones_hoy: number;
  incidencias_abiertas: number;
}

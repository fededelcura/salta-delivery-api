/**
 * Contrato HTTP uniforme de la API.
 * Todas las respuestas siguen esta forma (éxito o error).
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
}

export interface AuthSession {
  usuario: {
    id: string;
    numero_usuario: number;
    email: string;
    telefono: string;
    nombre: string;
    rol: string;
    estado: string;
  };
  tokens: AuthTokens;
}

export interface PlanInfoCliente {
  plan: string;
  monto_mensual: number;
  descuento_pct: number;
}

export interface PlanInfoCadete {
  plan: string;
  monto_mensual: number;
  comision_pct: number;
  dias_trial?: number;
}

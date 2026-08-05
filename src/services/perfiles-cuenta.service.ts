/**
 * Perfiles de cliente y tiempos típicos de operación.
 */

export type TipoCuentaCliente = 'particular' | 'restaurante' | 'comercio';

export type PerfilTiempos = {
  tipo: TipoCuentaCliente;
  label: string;
  descripcion: string;
  /** Minutos típicos antes de que el cadete deba llegar al origen */
  prep_default_min: number;
  prep_min: number;
  prep_max: number;
  /** Si true, el pedido espera “listo para retiro” */
  espera_listo: boolean;
  /** Copy corto para home / solicitar */
  cta_solicitar: string;
  hint_tiempo: string;
};

export const PERFILES_CUENTA: Record<TipoCuentaCliente, PerfilTiempos> = {
  particular: {
    tipo: 'particular',
    label: 'Usuario',
    descripcion: 'Envíos personales, mensajería y paquetes al momento',
    prep_default_min: 0,
    prep_min: 0,
    prep_max: 30,
    espera_listo: false,
    cta_solicitar: 'Pedir cadete ahora',
    hint_tiempo: 'El cadete sale apenas confirmás el pedido.',
  },
  restaurante: {
    tipo: 'restaurante',
    label: 'Restaurante',
    descripcion: 'Negocio gastronómico con tiempo de cocina',
    prep_default_min: 25,
    prep_min: 10,
    prep_max: 90,
    espera_listo: true,
    cta_solicitar: 'Despachar pedido',
    hint_tiempo:
      'Indicá cuántos minutos falta la comida. El cadete se coordina para llegar cuando esté lista.',
  },
  comercio: {
    tipo: 'comercio',
    label: 'Comercio',
    descripcion: 'Local de ventas con armado y ventana de retiro',
    prep_default_min: 15,
    prep_min: 5,
    prep_max: 120,
    espera_listo: true,
    cta_solicitar: 'Programar retiro',
    hint_tiempo:
      'Indicá demora de armado o hora de retiro. Ideal para locales y showrooms.',
  },
};

export function perfilDe(tipo?: string | null): PerfilTiempos {
  if (tipo === 'restaurante' || tipo === 'comercio') return PERFILES_CUENTA[tipo];
  return PERFILES_CUENTA.particular;
}

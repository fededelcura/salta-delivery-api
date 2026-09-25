import { z } from 'zod';

const coordenada = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const direccionEstructuradaSchema = z.object({
  calle: z.string().min(2).max(150),
  numero: z.string().min(1).max(20),
  piso_dpto: z.string().max(40).optional().nullable().default(null),
  barrio: z.string().min(2).max(100),
  ciudad: z.string().min(2).max(100).optional().default('Salta'),
  provincia: z.string().min(2).max(100).optional().default('Salta'),
});

export const registerSchema = z
  .object({
    email: z.string().email(),
    telefono: z.string().min(8).max(20),
    nombre: z.string().min(2).max(150),
    password: z.string().min(8).max(100),
    rol: z.enum(['cliente', 'cadete']),
    dni: z.string().min(7).max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.rol === 'cliente' && !data.dni?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DNI obligatorio para clientes',
        path: ['dni'],
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const verifyPhoneSchema = z.object({
  telefono: z.string().min(8).max(20),
  codigo: z.string().length(6),
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  codigo: z.string().length(6),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const solicitarViajeSchema = z.object({
  tipo_servicio: z.enum(['delivery', 'mensajeria', 'envio_paquete']).default('delivery'),
  origen_direccion: z.string().min(3).max(500),
  origen: coordenada,
  destino_direccion: z.string().min(3).max(500),
  destino: coordenada,
  metodo_pago: z.enum(['efectivo', 'mercadopago', 'tarjeta', 'billetera']).default('efectivo'),
  clima: z.string().optional(),
  /** Minutos de cocina / armado antes del retiro (restos y comercios) */
  tiempo_preparacion_min: z.number().int().min(0).max(180).optional(),
});

export const cancelarViajeSchema = z.object({
  motivo: z.string().max(500).optional(),
});

export const calificarSchema = z.object({
  calificacion: z.number().int().min(1).max(5),
  comentario: z.string().max(1000).optional(),
});

export const cadeteRegistrarSchema = z.object({
  email: z.string().email(),
  telefono: z.string().min(8).max(20),
  nombre: z.string().min(2).max(150),
  password: z.string().min(8).max(100),
  dni: z.string().min(7).max(20),
  licencia: z.string().min(3).max(50),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patente: z.string().min(5).max(20),
  marca_moto: z.string().max(50).optional(),
  datos_moto: z
    .object({
      marca: z.string().optional(),
      modelo: z.string().optional(),
      patente: z.string().optional(),
      color: z.string().optional(),
      anio: z.number().int().min(1980).max(2100).optional(),
    })
    .default({}),
  fotos_documentos: z.record(z.string()).default({}),
});

export const cadeteEstadoSchema = z.object({
  disponibilidad: z.enum(['online', 'offline', 'ocupado']),
});

export const ubicacionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  zona_h3: z.string().max(64).optional(),
});

export const estadoViajeCadeteSchema = z.object({
  estado: z.enum([
    'cadete_en_camino',
    'cadete_llego',
    'en_curso',
    'finalizado',
  ]),
});

export const reportarIncidenciaSchema = z.object({
  viaje_id: z.string().uuid().optional(),
  tipo: z.enum([
    'accidente',
    'demora',
    'paquete_danado',
    'paquete_perdido',
    'comportamiento',
    'pago',
    'tecnico',
    'otro',
  ]),
  nivel: z.enum(['bajo', 'medio', 'alto', 'critico']).default('medio'),
  descripcion: z.string().min(5).max(2000),
});

export const cambiarPlanSchema = z.object({
  plan: z.string().min(1),
});

export const clientePreferenciasSchema = z.object({
  metodo_pago_preferido: z
    .enum(['efectivo', 'mercadopago', 'tarjeta', 'billetera'])
    .optional(),
  direcciones_favoritas: z
    .array(
      z.object({
        alias: z.string().min(1).max(80),
        direccion: z.string().min(3).max(500),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        es_principal: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const crearTarjetaSchema = z.object({
  alias: z.string().max(80).optional(),
  numero: z.string().min(13).max(23),
  titular: z.string().min(3).max(150),
  vencimiento_mes: z.coerce.number().int().min(1).max(12),
  vencimiento_anio: z.coerce.number().int().min(2024).max(2100),
  es_predeterminado: z.boolean().optional(),
});

export const crearMercadoPagoSchema = z.object({
  alias: z.string().max(80).optional(),
  mp_email: z.string().email(),
  mp_alias: z.string().max(80).optional(),
  es_predeterminado: z.boolean().optional(),
});

export const recargarBilleteraSchema = z.object({
  monto: z.number().positive().max(500000),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const viajeIdParamSchema = z.object({
  viaje_id: z.string().uuid(),
});

export const calcularTarifaSchema = z.object({
  origen: coordenada,
  destino: coordenada,
  plan_cliente: z.enum(['gratuito', 'basico', 'plus', 'business']).optional(),
  plan_cadete: z.enum(['trial', 'silver', 'gold', 'premium']).optional(),
  clima: z.string().optional(),
  zona_multiplier: z.number().positive().optional(),
  demanda_multiplier: z.number().positive().optional(),
});

export const viajesFiltroSchema = z.object({
  estado: z.string().optional(),
  cliente_id: z.string().uuid().optional(),
  cadete_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const adminConfigTarifasSchema = z.object({
  base_fija: z.number().positive().optional(),
  precio_km: z.number().positive().optional(),
  precio_minuto: z.number().positive().optional(),
});

export const adminIncidenciaSchema = z.object({
  estado: z.enum(['abierta', 'en_proceso', 'resuelta', 'cerrada', 'escalada']).optional(),
  asignado_a: z.string().uuid().optional(),
  resolucion: z.string().max(2000).optional(),
});

export const adminCrearClienteSchema = z.object({
  email: z.string().email(),
  telefono: z.string().min(8).max(20),
  nombre: z.string().min(2).max(150),
  password: z.string().min(8).max(100),
  dni: z.string().min(7).max(20),
  direccion_parts: direccionEstructuradaSchema,
  tipo_cuenta: z.enum(['particular', 'restaurante', 'comercio']).default('particular'),
  tiempo_preparacion_min: z.number().int().min(0).max(180).optional(),
  horario_comercial: z
    .object({
      abre: z.string().optional(),
      cierra: z.string().optional(),
      dias: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional()
    .nullable(),
  plan_suscripcion: z.enum(['gratuito', 'basico', 'plus', 'business']).default('gratuito'),
  /** PDF/imagen DNI en data URL — obligatorio para validar identidad */
  documento_dni: z.string().min(32, 'Adjuntá el PDF o foto del DNI'),
});

export const adminCrearCadeteSchema = z.object({
  email: z.string().email(),
  telefono: z.string().min(8).max(20),
  nombre: z.string().min(2).max(150),
  password: z.string().min(8).max(100),
  dni: z.string().min(7).max(20),
  licencia: z.string().min(3).max(50),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marca_moto: z.string().max(50).optional().default(''),
  patente: z.string().min(5).max(20),
  direccion_parts: direccionEstructuradaSchema,
  aprobar: z.boolean().optional().default(true),
  documentos: z
    .object({
      dni: z.string().optional(),
      carnet: z.string().optional(),
      seguro: z.string().optional(),
      afip: z.string().optional(),
      rentas: z.string().optional(),
    })
    .optional()
    .default({}),
});

export const adminComisionesSchema = z.object({
  items: z
    .array(
      z.object({
        plan_cadete: z.enum(['trial', 'silver', 'gold', 'premium']),
        tipo_servicio: z.enum(['delivery', 'mensajeria', 'envio_paquete']),
        comision_pct: z.number().min(0).max(100),
      }),
    )
    .min(1),
});

export const adminGuardarReporteSchema = z.object({
  tipo: z.enum([
    'estadisticas',
    'comprobantes',
    'viajes',
    'financiero',
    'operativo',
    'actividad_cadetes',
  ]),
  titulo: z.string().min(3).max(200),
  periodo_desde: z.string().optional().nullable(),
  periodo_hasta: z.string().optional().nullable(),
  resumen: z.record(z.unknown()).default({}),
  detalle: z.record(z.unknown()).default({}),
});

export const cadeteDatosCobroSchema = z.object({
  cbu: z
    .string()
    .regex(/^\d{22}$/, 'CBU debe tener 22 dígitos')
    .optional(),
  alias_bancario: z.string().max(80).optional(),
  banco: z.string().max(80).optional(),
  titular_cuenta: z.string().max(150).optional(),
});

export const liquidacionPlazoSchema = z.object({
  dias: z.number().int().min(1).max(60),
});

export const liquidacionTransferirSchema = z.object({
  nota: z.string().max(500).optional(),
});

export const adminActualizarClienteSchema = z.object({
  nombre: z.string().min(2).max(150).optional(),
  email: z.string().email().optional(),
  telefono: z.string().min(8).max(20).optional(),
  dni: z.string().min(7).max(20).optional(),
  plan_suscripcion: z.enum(['gratuito', 'basico', 'plus', 'business']).optional(),
  tipo_cuenta: z.enum(['particular', 'restaurante', 'comercio']).optional(),
  tiempo_preparacion_min: z.number().int().min(0).max(180).optional(),
  horario_comercial: z
    .object({
      abre: z.string().optional(),
      cierra: z.string().optional(),
      dias: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional()
    .nullable(),
  direccion_parts: direccionEstructuradaSchema.optional(),
  estado: z.enum(['activo', 'inactivo', 'suspendido']).optional(),
});

export const adminActualizarCadeteSchema = z.object({
  nombre: z.string().min(2).max(150).optional(),
  email: z.string().email().optional(),
  telefono: z.string().min(8).max(20).optional(),
  dni: z.string().min(7).max(20).optional(),
  licencia: z.string().min(3).max(50).optional(),
  patente: z.string().min(5).max(20).optional(),
  marca_moto: z.string().max(50).optional().nullable(),
  direccion_parts: direccionEstructuradaSchema.optional(),
  cbu: z.string().regex(/^\d{22}$/).optional().nullable(),
  alias_bancario: z.string().max(80).optional().nullable(),
  banco: z.string().max(80).optional().nullable(),
  titular_cuenta: z.string().max(150).optional().nullable(),
  plan_suscripcion: z.enum(['trial', 'silver', 'gold', 'premium']).optional(),
  estado: z.enum(['activo', 'inactivo', 'suspendido']).optional(),
});

export const adminZonaSchema = z.object({
  h3_index: z.string().min(3).max(64),
  nombre: z.string().max(100).optional().nullable(),
  tipo: z
    .enum([
      'residencial',
      'comercial',
      'industrial',
      'aeropuerto',
      'centro',
      'periferia',
      'restringida',
    ])
    .default('residencial'),
  lat_centro: z.number().min(-90).max(90),
  lng_centro: z.number().min(-180).max(180),
  tarifa_multiplier: z.number().positive().max(10).default(1),
  activa: z.boolean().optional().default(true),
});

export const adminActualizarZonaSchema = adminZonaSchema.partial();

export const adminPlanesSchema = z.object({
  cliente: z
    .array(
      z.object({
        plan: z.enum(['gratuito', 'basico', 'plus', 'business']),
        monto_mensual: z.number().min(0),
        descuento_pct: z.number().min(0).max(100),
      }),
    )
    .optional(),
  cadete: z
    .array(
      z.object({
        plan: z.enum(['trial', 'silver', 'gold', 'premium']),
        monto_mensual: z.number().min(0),
        comision_pct: z.number().min(0).max(100),
        dias_trial: z.number().int().min(0).max(365).optional(),
      }),
    )
    .optional(),
});

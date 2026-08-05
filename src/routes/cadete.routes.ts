import { Router } from 'express';
import { cadeteController } from '../controllers/cadete.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import {
  cadeteDatosCobroSchema,
  cadeteEstadoSchema,
  cadeteRegistrarSchema,
  cambiarPlanSchema,
  estadoViajeCadeteSchema,
  idParamSchema,
  reportarIncidenciaSchema,
  ubicacionSchema,
} from '../middleware/validators.js';

const router = Router();

router.post(
  '/registrar',
  validate({ body: cadeteRegistrarSchema }),
  asyncHandler(cadeteController.registrar),
);

router.use(authenticate, authorize('cadete'));

router.patch(
  '/estado',
  validate({ body: cadeteEstadoSchema }),
  asyncHandler(cadeteController.estado),
);
router.get('/viajes-disponibles', asyncHandler(cadeteController.viajesDisponibles));
router.post(
  '/aceptar-viaje/:id',
  validate({ params: idParamSchema }),
  asyncHandler(cadeteController.aceptarViaje),
);
router.post(
  '/rechazar-viaje/:id',
  validate({ params: idParamSchema }),
  asyncHandler(cadeteController.rechazarViaje),
);
router.post(
  '/actualizar-ubicacion',
  validate({ body: ubicacionSchema }),
  asyncHandler(cadeteController.actualizarUbicacion),
);
router.patch(
  '/estado-viaje/:id',
  validate({ params: idParamSchema, body: estadoViajeCadeteSchema }),
  asyncHandler(cadeteController.estadoViaje),
);
router.get('/ganancias', asyncHandler(cadeteController.ganancias));
router.get('/suscripcion', asyncHandler(cadeteController.suscripcion));
router.post(
  '/suscripcion/cambiar',
  validate({ body: cambiarPlanSchema }),
  asyncHandler(cadeteController.cambiarPlan),
);
router.post(
  '/reportar-incidencia',
  validate({ body: reportarIncidenciaSchema }),
  asyncHandler(cadeteController.reportarIncidencia),
);
router.get('/comprobantes', asyncHandler(cadeteController.comprobantes));
router.get(
  '/comprobantes/:id',
  validate({ params: idParamSchema }),
  asyncHandler(cadeteController.comprobanteById),
);
router.get(
  '/viajes/:id/comprobantes',
  validate({ params: idParamSchema }),
  asyncHandler(cadeteController.comprobantesViaje),
);
router.get('/datos-cobro', asyncHandler(cadeteController.perfilCobro));
router.put(
  '/datos-cobro',
  validate({ body: cadeteDatosCobroSchema }),
  asyncHandler(cadeteController.datosCobro),
);

export default router;

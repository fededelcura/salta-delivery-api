import { Router } from 'express';
import { clienteController } from '../controllers/cliente.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import {
  calificarSchema,
  cancelarViajeSchema,
  cambiarPlanSchema,
  clientePreferenciasSchema,
  crearMercadoPagoSchema,
  crearTarjetaSchema,
  historialQuerySchema,
  idParamSchema,
  recargarBilleteraSchema,
  solicitarViajeSchema,
  viajeIdParamSchema,
} from '../middleware/validators.js';
import { AppError } from '../utils/errors.js';

const router = Router();

/** Ya no se pide sin cuenta: la PWA vieja cacheada recibe un mensaje claro. */
router.post('/solicitar-invitado', () => {
  throw new AppError('Para pedir necesitás una cuenta: ingresá o registrate.', 410, 'CUENTA_REQUERIDA');
});

router.use(authenticate, authorize('cliente'));

router.get('/perfil', asyncHandler(clienteController.perfil));
router.get('/negocio/umbral', asyncHandler(clienteController.umbralNegocio));
router.patch(
  '/perfil',
  validate({ body: clientePreferenciasSchema }),
  asyncHandler(clienteController.actualizarPreferencias),
);
router.get(
  '/viajes',
  validate({ query: historialQuerySchema }),
  asyncHandler(clienteController.viajes),
);
router.get('/destinos-recientes', asyncHandler(clienteController.destinosRecientes));

router.get('/medios-pago', asyncHandler(clienteController.mediosPago));
router.post(
  '/medios-pago/tarjeta',
  validate({ body: crearTarjetaSchema }),
  asyncHandler(clienteController.crearTarjeta),
);
router.post(
  '/medios-pago/mercadopago',
  validate({ body: crearMercadoPagoSchema }),
  asyncHandler(clienteController.crearMercadoPago),
);
router.post(
  '/medios-pago/billetera/recargar',
  validate({ body: recargarBilleteraSchema }),
  asyncHandler(clienteController.recargarBilletera),
);
router.post(
  '/medios-pago/:id/predeterminado',
  validate({ params: idParamSchema }),
  asyncHandler(clienteController.setMedioPredeterminado),
);
router.delete(
  '/medios-pago/:id',
  validate({ params: idParamSchema }),
  asyncHandler(clienteController.eliminarMedioPago),
);

router.post(
  '/solicitar-viaje',
  validate({ body: solicitarViajeSchema }),
  asyncHandler(clienteController.solicitarViaje),
);
router.post(
  '/cancelar-viaje/:id',
  validate({ params: idParamSchema, body: cancelarViajeSchema }),
  asyncHandler(clienteController.cancelarViaje),
);
router.get('/suscripcion', asyncHandler(clienteController.suscripcion));
router.post(
  '/suscripcion/cambiar',
  validate({ body: cambiarPlanSchema }),
  asyncHandler(clienteController.cambiarPlan),
);
router.post(
  '/calificar/:viaje_id',
  validate({ params: viajeIdParamSchema, body: calificarSchema }),
  asyncHandler(clienteController.calificar),
);
router.get('/comprobantes', asyncHandler(clienteController.comprobantes));
router.get(
  '/comprobantes/:id',
  validate({ params: idParamSchema }),
  asyncHandler(clienteController.comprobanteById),
);
router.get(
  '/viajes/:viaje_id/comprobantes',
  validate({ params: viajeIdParamSchema }),
  asyncHandler(clienteController.comprobantesViaje),
);

export default router;

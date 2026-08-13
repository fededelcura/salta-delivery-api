import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import {
  adminActualizarCadeteSchema,
  adminActualizarClienteSchema,
  adminActualizarZonaSchema,
  adminComisionesSchema,
  adminConfigTarifasSchema,
  adminCrearCadeteSchema,
  adminCrearClienteSchema,
  adminGuardarReporteSchema,
  adminIncidenciaSchema,
  adminPlanesSchema,
  adminZonaSchema,
  idParamSchema,
  liquidacionPlazoSchema,
  liquidacionTransferirSchema,
} from '../middleware/validators.js';

const router = Router();

router.use(authenticate, authorize('administrador'));

router.get('/dashboard', asyncHandler(adminController.dashboard));
router.get('/cadetes', asyncHandler(adminController.cadetes));
router.get('/cadetes/actividad', asyncHandler(adminController.actividadCadetes));
router.post(
  '/cadetes',
  validate({ body: adminCrearCadeteSchema }),
  asyncHandler(adminController.crearCadete),
);
router.patch(
  '/cadetes/:id',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.aprobarCadete),
);
router.put(
  '/cadetes/:id',
  validate({ params: idParamSchema, body: adminActualizarCadeteSchema }),
  asyncHandler(adminController.actualizarCadete),
);
router.post(
  '/cadetes/:id/baja',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.bajaCadete),
);
router.post(
  '/cadetes/:id/reactivar',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.reactivarCadete),
);
router.post(
  '/cadetes/:id/documentos',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.subirDocumentosCadete),
);
router.get('/clientes', asyncHandler(adminController.clientes));
router.post(
  '/clientes',
  validate({ body: adminCrearClienteSchema }),
  asyncHandler(adminController.crearCliente),
);
router.put(
  '/clientes/:id',
  validate({ params: idParamSchema, body: adminActualizarClienteSchema }),
  asyncHandler(adminController.actualizarCliente),
);
router.post(
  '/clientes/:id/baja',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.bajaCliente),
);
router.post(
  '/clientes/:id/reactivar',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.reactivarCliente),
);
router.get('/viajes', asyncHandler(adminController.viajes));
router.get('/reportes', asyncHandler(adminController.reportes));
router.get('/reportes/guardados', asyncHandler(adminController.listarReportesGuardados));
router.get(
  '/reportes/guardados/:id',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.getReporteGuardado),
);
router.post(
  '/reportes/guardar',
  validate({ body: adminGuardarReporteSchema }),
  asyncHandler(adminController.guardarReporte),
);
router.get('/configurar-tarifas', asyncHandler(adminController.getTarifas));
router.put(
  '/configurar-tarifas',
  validate({ body: adminConfigTarifasSchema }),
  asyncHandler(adminController.configurarTarifas),
);
router.get('/planes', asyncHandler(adminController.getPlanes));
router.put(
  '/planes',
  validate({ body: adminPlanesSchema }),
  asyncHandler(adminController.setPlanes),
);
router.get('/zonas', asyncHandler(adminController.listarZonas));
router.post(
  '/zonas',
  validate({ body: adminZonaSchema }),
  asyncHandler(adminController.crearZona),
);
router.put(
  '/zonas/:id',
  validate({ params: idParamSchema, body: adminActualizarZonaSchema }),
  asyncHandler(adminController.actualizarZona),
);
router.post(
  '/zonas/:id/baja',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.bajaZona),
);
router.get('/incidencias', asyncHandler(adminController.incidencias));
router.patch(
  '/incidencias/:id',
  validate({ params: idParamSchema, body: adminIncidenciaSchema }),
  asyncHandler(adminController.actualizarIncidencia),
);
router.get('/comisiones', asyncHandler(adminController.listarComisiones));
router.put(
  '/comisiones',
  validate({ body: adminComisionesSchema }),
  asyncHandler(adminController.guardarComisiones),
);
router.get('/comprobantes', asyncHandler(adminController.listarComprobantes));
router.get(
  '/viajes/:id/comprobantes',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.comprobantesViaje),
);
router.get(
  '/comprobantes/:id',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.comprobanteById),
);
router.get(
  '/clientes/:id/detalle',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.detalleCliente),
);
router.get(
  '/cadetes/:id/detalle',
  validate({ params: idParamSchema }),
  asyncHandler(adminController.detalleCadete),
);
router.get('/liquidaciones', asyncHandler(adminController.liquidaciones));
router.get('/liquidaciones/plazo', asyncHandler(adminController.plazoLiquidacion));
router.put(
  '/liquidaciones/plazo',
  validate({ body: liquidacionPlazoSchema }),
  asyncHandler(adminController.setPlazoLiquidacion),
);
router.post(
  '/liquidaciones/:id/transferir',
  validate({ params: idParamSchema, body: liquidacionTransferirSchema }),
  asyncHandler(adminController.transferirLiquidacion),
);

export default router;

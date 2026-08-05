import { Router } from 'express';
import { viajeController } from '../controllers/viaje.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import {
  calcularTarifaSchema,
  idParamSchema,
  viajesFiltroSchema,
} from '../middleware/validators.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validate({ query: viajesFiltroSchema }),
  asyncHandler(viajeController.listar),
);

/** Preview de tarifa (sin viaje persistido) */
router.post(
  '/calcular-tarifa',
  validate({ body: calcularTarifaSchema }),
  asyncHandler(viajeController.calcularTarifa),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(viajeController.getById),
);

router.post(
  '/:id/calcular-tarifa',
  validate({ params: idParamSchema, body: calcularTarifaSchema }),
  asyncHandler(viajeController.calcularTarifa),
);

export default router;

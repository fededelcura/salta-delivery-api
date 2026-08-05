import { Router } from 'express';
import { suscripcionController } from '../controllers/suscripcion.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import { cambiarPlanSchema } from '../middleware/validators.js';

const router = Router();

router.get('/planes', asyncHandler(suscripcionController.planes));

router.use(authenticate);

router.get('/mi-plan', asyncHandler(suscripcionController.miPlan));
router.post(
  '/cambiar-plan',
  validate({ body: cambiarPlanSchema }),
  asyncHandler(suscripcionController.cambiarPlan),
);
router.post('/cancelar', asyncHandler(suscripcionController.cancelar));

export default router;

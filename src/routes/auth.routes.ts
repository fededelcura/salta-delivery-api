import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import {
  loginSchema,
  registerSchema,
  verifyPhoneSchema,
} from '../middleware/validators.js';

const router = Router();

/** POST /api/auth/register */
router.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

/** POST /api/auth/login */
router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

/** POST /api/auth/verify-phone — código de prueba: 123456 */
router.post(
  '/verify-phone',
  validate({ body: verifyPhoneSchema }),
  asyncHandler(authController.verifyPhone),
);

export default router;

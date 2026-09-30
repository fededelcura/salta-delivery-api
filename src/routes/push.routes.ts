import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler, validate } from '../middleware/error.middleware.js';
import { pushDesuscribirSchema, pushSuscribirSchema } from '../middleware/validators.js';
import { pushService, type SuscripcionInput } from '../services/push.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { ok } from '../utils/response.js';

const router = Router();

router.get(
  '/clave-publica',
  asyncHandler(async (_req, res) => {
    ok(res, { clave: pushService.clavePublica() });
  }),
);

router.post(
  '/suscribir',
  authenticate,
  validate({ body: pushSuscribirSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user?.sub) throw new UnauthorizedError();
    ok(
      res,
      await pushService.suscribir(req.user.sub, req.body as SuscripcionInput, req.get('user-agent')),
    );
  }),
);

router.delete(
  '/suscribir',
  authenticate,
  validate({ body: pushDesuscribirSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user?.sub) throw new UnauthorizedError();
    ok(res, await pushService.desuscribir(req.user.sub, (req.body as { endpoint: string }).endpoint));
  }),
);

export default router;

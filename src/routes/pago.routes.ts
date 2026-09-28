import { Router } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { pagoEnvioModel } from '../models/pago-envio.model.js';
import { ok } from '../utils/response.js';

const router = Router();

router.get(
  '/viaje/:token',
  asyncHandler(async (req, res) => {
    ok(res, await pagoEnvioModel.resumenPorToken(String(req.params.token)));
  }),
);

router.post(
  '/viaje/:token/mercadopago',
  asyncHandler(async (req, res) => {
    ok(res, await pagoEnvioModel.iniciarMercadoPago(String(req.params.token)));
  }),
);

export default router;

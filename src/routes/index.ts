import { Router } from 'express';
import authRoutes from './auth.routes.js';
import clienteRoutes from './cliente.routes.js';
import cadeteRoutes from './cadete.routes.js';
import viajeRoutes from './viaje.routes.js';
import suscripcionRoutes from './suscripcion.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/clientes', clienteRoutes);
router.use('/cadetes', cadeteRoutes);
router.use('/viajes', viajeRoutes);
router.use('/suscripciones', suscripcionRoutes);
router.use('/admin', adminRoutes);

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'salta-delivery-api',
      db: 'SQL Server 2025',
    },
  });
});

export default router;

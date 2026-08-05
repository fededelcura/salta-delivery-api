import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '12mb' }));
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Salta Delivery API',
        version: '0.1.0',
        channels: ['web-admin', 'mobile-cliente', 'mobile-cadete'],
        docs: '/api/health',
      },
    });
  });

  app.use('/api', routes);

  app.use(errorHandler);

  return app;
}

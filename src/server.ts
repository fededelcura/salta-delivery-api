import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { getPool, closePool } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { setupSockets } from './sockets/index.js';
import { startViajeAlertaWorker, stopViajeAlertaWorker } from './jobs/viaje-alerta.worker.js';

async function main(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  setupSockets(server);

  try {
    await getPool();
    const dbLabel = env.DATABASE_URL
      ? env.DATABASE_URL.replace(/:[^:@/]+@/, ':****@')
      : `${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}`;
    console.info(`[db] PostgreSQL conectado → ${dbLabel}`);
  } catch (err) {
    console.error('[db] No se pudo conectar a PostgreSQL:', err);
    console.error('Tip: verificá DATABASE_URL / PG* y que exista la DB salta_delivery.');
    process.exit(1);
  }

  await connectRedis();
  startViajeAlertaWorker();

  server.listen(env.PORT, () => {
    console.info(`[api] Salta Delivery escuchando en http://localhost:${env.PORT}`);
    console.info(`[api] health → http://localhost:${env.PORT}/api/health`);
  });

  const shutdown = async () => {
    console.info('Cerrando…');
    stopViajeAlertaWorker();
    server.close();
    await disconnectRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();

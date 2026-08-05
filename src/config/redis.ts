import Redis from 'ioredis';
import { env } from './env.js';

/**
 * Cliente Redis opcional.
 * Si REDIS_ENABLED=false o no hay servidor, la API sigue sin spam de errores.
 */
let client: Redis | null = null;
let available = false;
let warnedOffline = false;

export function getRedis(): Redis | null {
  return available ? client : null;
}

export function isRedisAvailable(): boolean {
  return available;
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_ENABLED) {
    console.info('[redis] deshabilitado (REDIS_ENABLED=false) — OK para desarrollo local');
    return;
  }

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    // No reintentar en loop si Redis no está
    retryStrategy: () => null,
    reconnectOnError: () => false,
  });

  client.on('error', (err) => {
    available = false;
    if (!warnedOffline) {
      warnedOffline = true;
      console.warn('[redis] no disponible:', err.message);
      console.warn('[redis] omitido — la API sigue sin caché/pubsub local');
      void teardownClient();
    }
  });

  client.on('connect', () => {
    available = true;
    warnedOffline = false;
    console.info('[redis] conectado');
  });

  try {
    await client.connect();
    await client.ping();
    available = true;
  } catch {
    available = false;
    if (!warnedOffline) {
      warnedOffline = true;
      console.warn('[redis] omitido — la API corre sin caché/pubsub en tiempo real local');
    }
    await teardownClient();
  }
}

async function teardownClient(): Promise<void> {
  if (!client) return;
  const c = client;
  client = null;
  available = false;
  c.removeAllListeners();
  try {
    c.disconnect();
  } catch {
    /* ignore */
  }
}

export async function disconnectRedis(): Promise<void> {
  await teardownClient();
}

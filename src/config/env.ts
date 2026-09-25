import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const envSchema = z.object({
  DATABASE_URL: z.string().optional().default(''),
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().default('salta_delivery'),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().optional().default(''),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  REDIS_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(''),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default('Salta Delivery <onboarding@resend.dev>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Configuración de entorno inválida');
}

const data = parsed.data;
if (!data.DATABASE_URL && !data.PGPASSWORD && data.NODE_ENV !== 'test') {
  console.warn('[env] Sin DATABASE_URL ni PGPASSWORD — la conexión a Postgres puede fallar');
}

export const env = data;

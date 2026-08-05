import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const envSchema = z.object({
  SQLSERVER_SERVER: z.string().min(1),
  SQLSERVER_PORT: z.coerce.number().int().positive().default(1433),
  SQLSERVER_DATABASE: z.string().min(1),
  SQLSERVER_USER: z.string().optional().default(''),
  SQLSERVER_PASSWORD: z.string().optional().default(''),
  SQLSERVER_TRUST_CERTIFICATE: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  SQLSERVER_ENCRYPT: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  SQLSERVER_TRUSTED_CONNECTION: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Configuración de entorno inválida');
}

export const env = parsed.data;

/**
 * pg devuelve JSON/JSONB ya parseado; SQL Server lo devolvía como string.
 * Unifica ambos casos.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Igual que parseJsonField pero lanza si falta el valor (configs obligatorias). */
export function requireJsonField<T = Record<string, unknown>>(value: unknown): T {
  if (value == null || value === '') {
    throw new Error('Campo JSON vacío');
  }
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') return JSON.parse(value) as T;
  throw new Error('Campo JSON inválido');
}

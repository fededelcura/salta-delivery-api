import type { Response } from 'express';
import type { ApiSuccess } from '../types/api.js';

export function ok<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: ApiSuccess<T>['meta'],
): Response {
  const body: ApiSuccess<T> = { success: true, data };
  if (meta) {
    body.meta = meta;
  }
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

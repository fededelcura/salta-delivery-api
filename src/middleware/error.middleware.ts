import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError, ValidationError } from '../utils/errors.js';
import type { ApiErrorBody } from '../types/api.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: err.flatten(),
      },
    };
    res.status(422).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  console.error('[unhandled]', err);
  const body: ApiErrorBody = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : err instanceof Error
            ? err.message
            : 'Error desconocido',
    },
  };
  res.status(500).json(body);
}

/** Valida body / query / params con Zod y adjunta a req */
export function validate<TBody = unknown, TQuery = unknown, TParams = unknown>(schemas: {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.assign(req.query, parsed);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        next(new ValidationError('Datos inválidos', e.flatten()));
        return;
      }
      next(e);
    }
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

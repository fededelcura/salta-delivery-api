import type { Request, Response } from 'express';
import { authModel } from '../models/auth.model.js';
import { signToken } from '../middleware/auth.middleware.js';
import { ok, created } from '../utils/response.js';
import type { AuthSession } from '../types/api.js';
import type { RolUsuario } from '../types/domain.js';
import { env } from '../config/env.js';

function toSession(user: {
  id: string;
  numero_usuario: number;
  email: string;
  telefono: string;
  nombre: string;
  rol: string;
  estado: string;
}): AuthSession {
  const accessToken = signToken({
    sub: user.id,
    email: user.email,
    rol: user.rol as RolUsuario,
  });

  return {
    usuario: {
      id: user.id,
      numero_usuario: user.numero_usuario,
      email: user.email,
      telefono: user.telefono,
      nombre: user.nombre,
      rol: user.rol,
      estado: user.estado,
    },
    tokens: {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
      tokenType: 'Bearer',
    },
  };
}

export class AuthController {
  register = async (req: Request, res: Response): Promise<void> => {
    const result = await authModel.register(req.body);
    created(res, result);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const user = await authModel.login(req.body.email, req.body.password);
    ok(res, toSession(user));
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    const user = await authModel.verifyEmail(req.body.email, req.body.codigo);
    ok(res, toSession(user));
  };

  resendVerification = async (req: Request, res: Response): Promise<void> => {
    ok(res, await authModel.resendVerification(req.body.email));
  };

  verifyPhone = async (req: Request, res: Response): Promise<void> => {
    ok(res, await authModel.verifyPhone(req.body.telefono, req.body.codigo));
  };
}

export const authController = new AuthController();

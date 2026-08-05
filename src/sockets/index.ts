/**
 * Socket.io — tracking en tiempo real (web + mobile).
 * Eventos:
 *  - cadete:ubicacion  { viaje_id?, lat, lng }
 *  - viaje:subscribe   { viaje_id }
 *  - viaje:estado      { viaje_id, estado }
 */

import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { JwtPayload } from '../types/domain.js';

let ioRef: Server | null = null;

export function getIO(): Server | null {
  return ioRef;
}

/** Emite cambio de estado a sala del viaje + panel admin */
export function emitViajeEstado(viajeId: string, estado: string, by?: string): void {
  if (!ioRef) return;
  const payload = { viaje_id: viajeId, estado, by, ts: new Date().toISOString() };
  ioRef.to(`viaje:${viajeId}`).emit('viaje:estado', payload);
  ioRef.to('admin').emit('viaje:estado', payload);
}

export function setupSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    },
  });
  ioRef = io;

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);

    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JwtPayload;
    void socket.join(`user:${user.sub}`);
    if (user.rol === 'administrador') {
      void socket.join('admin');
    }

    socket.on('viaje:subscribe', (payload: { viaje_id: string }) => {
      if (payload?.viaje_id) {
        void socket.join(`viaje:${payload.viaje_id}`);
      }
    });

    socket.on(
      'cadete:ubicacion',
      (payload: { viaje_id?: string; lat: number; lng: number }) => {
        if (payload?.viaje_id) {
          io.to(`viaje:${payload.viaje_id}`).emit('cadete:ubicacion', {
            cadete_id: user.sub,
            ...payload,
            ts: new Date().toISOString(),
          });
        }
        io.to('admin').emit('cadete:ubicacion', {
          cadete_id: user.sub,
          ...payload,
          ts: new Date().toISOString(),
        });
      },
    );

    socket.on(
      'viaje:estado',
      (payload: { viaje_id: string; estado: string }) => {
        if (!payload?.viaje_id) return;
        io.to(`viaje:${payload.viaje_id}`).emit('viaje:estado', {
          ...payload,
          by: user.sub,
          ts: new Date().toISOString(),
        });
        io.to('admin').emit('viaje:estado', payload);
      },
    );
  });

  return io;
}

/** Helper para emitir desde controllers/services */
export type AppSocketServer = Server;

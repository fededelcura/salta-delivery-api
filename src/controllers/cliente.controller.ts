import type { Request, Response } from 'express';
import { authModel } from '../models/auth.model.js';
import { clienteModel } from '../models/cliente.model.js';
import { viajeModel } from '../models/viaje.model.js';
import { adminModel } from '../models/admin.model.js';
import { medioPagoModel } from '../models/medio-pago.model.js';
import { comprobanteModel } from '../models/facturacion.model.js';
import { toSession } from './auth.controller.js';
import { ok, created } from '../utils/response.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { DireccionFavorita, MetodoPago, PlanCliente } from '../types/domain.js';
import { emitViajeEstado } from '../sockets/index.js';

function uid(req: Request): string {
  if (!req.user?.sub) throw new UnauthorizedError();
  return req.user.sub;
}

export class ClienteController {
  perfil = async (req: Request, res: Response): Promise<void> => {
    ok(res, await clienteModel.getPerfil(uid(req)));
  };

  actualizarPreferencias = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      metodo_pago_preferido?: MetodoPago;
      direcciones_favoritas?: DireccionFavorita[];
    };
    ok(res, await clienteModel.actualizarPreferencias(uid(req), body));
  };

  viajes = async (req: Request, res: Response): Promise<void> => {
    const data = await viajeModel.listar({ cliente_id: uid(req) });
    ok(res, data.items, 200, { total: data.total, page: data.page, pageSize: data.pageSize });
  };

  destinosRecientes = async (req: Request, res: Response): Promise<void> => {
    const perfil = await clienteModel.getPerfil(uid(req));
    const data = await viajeModel.listar({
      cliente_id: uid(req),
      pageSize: 30,
    });
    const fromTrips = data.items
      .filter((v) => v.destino?.lat != null && v.destino_direccion)
      .map((v) => ({
        alias: 'Anterior',
        direccion: v.destino_direccion,
        lat: v.destino.lat,
        lng: v.destino.lng,
      }));

    const seen = new Set<string>();
    const merged = [...perfil.direcciones_favoritas, ...fromTrips].filter((d) => {
      const k = d.direccion.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    ok(res, merged.slice(0, 15));
  };

  mediosPago = async (req: Request, res: Response): Promise<void> => {
    await medioPagoModel.asegurarBilletera(uid(req));
    ok(res, await medioPagoModel.listar(uid(req)));
  };

  crearTarjeta = async (req: Request, res: Response): Promise<void> => {
    created(res, await medioPagoModel.crearTarjeta(uid(req), req.body));
  };

  crearMercadoPago = async (req: Request, res: Response): Promise<void> => {
    created(res, await medioPagoModel.crearMercadoPago(uid(req), req.body));
  };

  recargarBilletera = async (req: Request, res: Response): Promise<void> => {
    ok(res, await medioPagoModel.recargarBilletera(uid(req), Number(req.body.monto)));
  };

  setMedioPredeterminado = async (req: Request, res: Response): Promise<void> => {
    const medio = await medioPagoModel.setPredeterminado(uid(req), req.params.id as string);
    const metodo: MetodoPago =
      medio.tipo === 'tarjeta'
        ? 'tarjeta'
        : medio.tipo === 'mercadopago'
          ? 'mercadopago'
          : 'billetera';
    await clienteModel.actualizarPreferencias(uid(req), { metodo_pago_preferido: metodo });
    ok(res, medio);
  };

  eliminarMedioPago = async (req: Request, res: Response): Promise<void> => {
    ok(res, await medioPagoModel.eliminar(uid(req), req.params.id as string));
  };

  solicitarViaje = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      tipo_servicio: string;
      origen_direccion: string;
      origen: { lat: number; lng: number };
      destino_direccion: string;
      destino: { lat: number; lng: number };
      metodo_pago: string;
      tiempo_preparacion_min?: number;
    };
    const viaje = await viajeModel.solicitar({
      clienteId: uid(req),
      tipo_servicio: body.tipo_servicio as 'delivery' | 'mensajeria' | 'envio_paquete',
      origen_direccion: body.origen_direccion,
      origen: body.origen,
      destino_direccion: body.destino_direccion,
      destino: body.destino,
      metodo_pago: body.metodo_pago as 'efectivo' | 'mercadopago' | 'tarjeta' | 'billetera',
      tiempo_preparacion_min: body.tiempo_preparacion_min,
    });

    try {
      await clienteModel.agregarDireccionUsada(uid(req), {
        alias: 'Destino reciente',
        direccion: req.body.destino_direccion as string,
        lat: (req.body.destino as { lat: number }).lat,
        lng: (req.body.destino as { lng: number }).lng,
      });
    } catch {
      /* no bloquear */
    }

    ok(res, viaje, 201);
  };

  /** Pedido público: crea/reusa cliente por teléfono y devuelve sesión JWT */
  solicitarViajeInvitado = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      telefono: string;
      nombre: string;
      email?: string;
      tipo_servicio: string;
      origen_direccion: string;
      origen: { lat: number; lng: number };
      destino_direccion: string;
      destino: { lat: number; lng: number };
      metodo_pago: string;
      tiempo_preparacion_min?: number;
    };

    const user = await authModel.findOrCreateGuestCliente({
      telefono: body.telefono,
      nombre: body.nombre,
      email: body.email,
    });

    const viaje = await viajeModel.solicitar({
      clienteId: user.id,
      tipo_servicio: body.tipo_servicio as 'delivery' | 'mensajeria' | 'envio_paquete',
      origen_direccion: body.origen_direccion,
      origen: body.origen,
      destino_direccion: body.destino_direccion,
      destino: body.destino,
      metodo_pago: body.metodo_pago as 'efectivo' | 'mercadopago' | 'tarjeta' | 'billetera',
      tiempo_preparacion_min: body.tiempo_preparacion_min,
    });

    try {
      await clienteModel.agregarDireccionUsada(user.id, {
        alias: 'Destino reciente',
        direccion: body.destino_direccion,
        lat: body.destino.lat,
        lng: body.destino.lng,
      });
    } catch {
      /* no bloquear */
    }

    created(res, { viaje, session: toSession(user) });
  };

  cancelarViaje = async (req: Request, res: Response): Promise<void> => {
    const viaje = await viajeModel.cancelar(req.params.id as string, uid(req), req.body.motivo);
    emitViajeEstado(viaje.id, viaje.estado, uid(req));
    ok(res, viaje);
  };

  suscripcion = async (req: Request, res: Response): Promise<void> => {
    const perfil = await clienteModel.getPerfil(uid(req));
    const planes = adminModel.planes().cliente;
    ok(res, {
      actual: {
        plan: perfil.plan_suscripcion,
        estado: perfil.estado_suscripcion,
        fecha_inicio: perfil.fecha_inicio_suscripcion,
        fecha_fin: perfil.fecha_fin_suscripcion,
      },
      planes,
    });
  };

  calificar = async (req: Request, res: Response): Promise<void> => {
    const viaje = await viajeModel.calificar(
      req.params.viaje_id as string,
      uid(req),
      'cliente',
      req.body.calificacion,
      req.body.comentario,
    );
    ok(res, viaje);
  };

  cambiarPlan = async (req: Request, res: Response): Promise<void> => {
    const perfil = await clienteModel.actualizarPlan(uid(req), req.body.plan as PlanCliente);
    ok(res, perfil);
  };

  comprobantes = async (req: Request, res: Response): Promise<void> => {
    ok(res, await comprobanteModel.listarPorUsuario(uid(req)));
  };

  comprobanteById = async (req: Request, res: Response): Promise<void> => {
    ok(res, await comprobanteModel.getById(req.params.id as string, uid(req)));
  };

  comprobantesViaje = async (req: Request, res: Response): Promise<void> => {
    const list = await comprobanteModel.listarPorViaje(req.params.viaje_id as string);
    ok(
      res,
      list.filter((c) => c.usuario_id === uid(req)),
    );
  };
}

export const clienteController = new ClienteController();

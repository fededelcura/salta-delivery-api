/**
 * pagos.service.ts — integración Mercado Pago (sandbox / stub listo para token).
 */

import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import type { MetodoPago } from '../types/domain.js';

export interface CrearPreferenciaInput {
  titulo: string;
  monto: number;
  moneda?: string;
  referenciaExterna: string;
  metadata?: Record<string, unknown>;
}

export interface PreferenciaPago {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  external_reference: string;
  estado: 'creada' | 'simulada';
}

export class PagosService {
  async crearPreferencia(input: CrearPreferenciaInput): Promise<PreferenciaPago> {
    if (input.monto <= 0) {
      throw new AppError('Monto inválido', 400, 'INVALID_AMOUNT');
    }

    // Sin token: modo simulado (desarrollo)
    if (!env.MERCADOPAGO_ACCESS_TOKEN) {
      const id = `sim_${input.referenciaExterna}`;
      return {
        id,
        init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
        sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
        external_reference: input.referenciaExterna,
        estado: 'simulada',
      };
    }

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: input.titulo,
            quantity: 1,
            unit_price: input.monto,
            currency_id: input.moneda ?? 'ARS',
          },
        ],
        external_reference: input.referenciaExterna,
        metadata: input.metadata ?? {},
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new AppError('Error Mercado Pago', 502, 'MP_ERROR', text);
    }

    const data = (await res.json()) as {
      id: string;
      init_point: string;
      sandbox_init_point: string;
    };

    return {
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
      external_reference: input.referenciaExterna,
      estado: 'creada',
    };
  }

  requierePasarela(metodo: MetodoPago): boolean {
    return metodo === 'mercadopago' || metodo === 'tarjeta';
  }
}

export const pagosService = new PagosService();

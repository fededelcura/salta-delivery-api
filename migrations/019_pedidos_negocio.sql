/*
  019 — Pedidos de negocios: quién paga el envío según el importe del pedido.
  - clientes.umbral_envio_negocio: desde qué importe el negocio paga el envío (NULL = usa el global).
  - viajes: importe del pedido, pagador del envío, destinatario y token del link de pago.
  - Método de pago 'cuenta_negocio' (cuenta corriente del negocio, la cobra el admin).
  - Config global negocios.umbral_envio_default.
*/

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS umbral_envio_negocio DECIMAL(12,2) NULL;

ALTER TABLE public.viajes
  ADD COLUMN IF NOT EXISTS importe_pedido        DECIMAL(12,2) NULL,
  ADD COLUMN IF NOT EXISTS pagador_envio         VARCHAR(10)   NOT NULL DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS destinatario_nombre   VARCHAR(150)  NULL,
  ADD COLUMN IF NOT EXISTS destinatario_telefono VARCHAR(20)   NULL,
  ADD COLUMN IF NOT EXISTS pago_token            UUID          NULL;

ALTER TABLE public.viajes DROP CONSTRAINT IF EXISTS ck_viajes_pagador;
ALTER TABLE public.viajes
  ADD CONSTRAINT ck_viajes_pagador CHECK (pagador_envio IN ('cliente', 'negocio'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_viajes_pago_token
  ON public.viajes (pago_token) WHERE pago_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_viajes_cuenta_negocio
  ON public.viajes (cliente_id, fecha_solicitud DESC)
  WHERE metodo_pago = 'cuenta_negocio' AND estado_pago = 'pendiente';

ALTER TABLE public.viajes DROP CONSTRAINT IF EXISTS ck_viajes_metodo;
ALTER TABLE public.viajes
  ADD CONSTRAINT ck_viajes_metodo CHECK (metodo_pago IN (
    'efectivo', 'mercadopago', 'tarjeta', 'billetera', 'cuenta_negocio'
  ));

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS ck_pagos_metodo;
ALTER TABLE public.pagos
  ADD CONSTRAINT ck_pagos_metodo CHECK (metodo_pago IN (
    'efectivo', 'mercadopago', 'tarjeta', 'billetera', 'cuenta_negocio'
  ));

INSERT INTO public.configuraciones (clave, valor, descripcion)
VALUES (
  'negocios.umbral_envio_default',
  '{"monto": 20000}'::jsonb,
  'Importe del pedido desde el cual el negocio paga el envío (si el negocio no tiene umbral propio)'
)
ON CONFLICT (clave) DO NOTHING;

/*
  021 — Web Push: suscripciones del navegador por usuario (avisos de pedido nuevo al cadete
  con la app cerrada). Un usuario puede tener varias (celular, PC). Se borran solas cuando
  el servicio de push responde 404/410.
*/

CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id   UUID         NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  endpoint     TEXT         NOT NULL,
  p256dh       TEXT         NOT NULL,
  auth         TEXT         NOT NULL,
  user_agent   VARCHAR(300) NULL,
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ultimo_envio TIMESTAMPTZ  NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_suscripciones_endpoint
  ON public.push_suscripciones (endpoint);

CREATE INDEX IF NOT EXISTS ix_push_suscripciones_usuario
  ON public.push_suscripciones (usuario_id);

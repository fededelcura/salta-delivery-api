/*
  018 — Índices para crecimiento.
  - Borra índices duplicados o cubiertos por el prefijo de otro compuesto.
  - Historial por cliente/cadete y listado admin ordenados por (fecha_solicitud, id): paginación por cursor.
  - Parciales para lo que se consulta todo el tiempo: viajes sin cadete y cadetes online.
*/

-- Duplicados exactos
DROP INDEX IF EXISTS public.ix_viajes_activos;       -- = ix_viajes_estado
DROP INDEX IF EXISTS public.ix_usuarios_telefono;    -- = uq_usuarios_telefono

-- Cubiertos por el prefijo de un compuesto
DROP INDEX IF EXISTS public.ix_viajes_estado;          -- ix_viajes_estado_fecha
DROP INDEX IF EXISTS public.ix_viajes_cliente;         -- ix_viajes_cliente_fecha
DROP INDEX IF EXISTS public.ix_viajes_cadete;          -- ix_viajes_cadete_fecha
DROP INDEX IF EXISTS public.ix_cadetes_disponibilidad; -- ix_cadetes_online
DROP INDEX IF EXISTS public.ix_incidencias_viaje;      -- ix_incidencias_viaje_tipo_estado

-- Historial y listado admin (cursor = fecha_solicitud, id)
CREATE INDEX IF NOT EXISTS ix_viajes_cliente_fecha
  ON public.viajes (cliente_id, fecha_solicitud DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_viajes_cadete_fecha
  ON public.viajes (cadete_id, fecha_solicitud DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_viajes_fecha
  ON public.viajes (fecha_solicitud DESC, id DESC);

-- Viajes esperando cadete (worker 30 s + listado de cadetes)
CREATE INDEX IF NOT EXISTS ix_viajes_buscando
  ON public.viajes (fecha_solicitud)
  WHERE estado IN ('solicitado', 'buscando_cadete') AND cadete_id IS NULL;

-- Cadetes despachables con GPS (bbox de cercanía)
CREATE INDEX IF NOT EXISTS ix_cadetes_despachables
  ON public.cadetes (ubicacion_lat, ubicacion_lng)
  WHERE disponibilidad = 'online'
    AND estado_verificacion = 'aprobado'
    AND ubicacion_lat IS NOT NULL
    AND ubicacion_lng IS NOT NULL;

-- Alertas por viaje (crearIncidenciaSiNoExiste / escalarSinCadete)
CREATE INDEX IF NOT EXISTS ix_incidencias_viaje_tipo_estado
  ON public.incidencias (viaje_id, tipo, estado);

-- Panel de incidencias: abiertas más recientes primero
CREATE INDEX IF NOT EXISTS ix_incidencias_estado_fecha
  ON public.incidencias (estado, fecha_creacion DESC);

ANALYZE public.viajes;
ANALYZE public.cadetes;
ANALYZE public.incidencias;
ANALYZE public.usuarios;

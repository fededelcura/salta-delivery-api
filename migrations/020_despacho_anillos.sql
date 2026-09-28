-- Despacho por anillos: radios (km) que se amplían cada paso_seg sin aceptar.
INSERT INTO configuraciones (clave, valor, descripcion)
VALUES (
  'despacho.anillos',
  '{"radios_km":[3,6,10],"paso_seg":60}'::jsonb,
  'Radios (km) y segundos entre anillos para ofrecer pedidos a cadetes'
)
ON CONFLICT (clave) DO NOTHING;

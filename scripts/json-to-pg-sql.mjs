/**
 * Genera database/postgres/003_cargar_datos.sql desde data-export/*.json
 * para pegar en DBeaver (conexión Salta-Delivery).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../../database/postgres/data-export');
const out = path.resolve(__dirname, '../../database/postgres/003_cargar_datos.sql');

function load(name) {
  const f = path.join(dir, `${name}.json`);
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'object') return esc(JSON.stringify(v));
  let s = String(v);
  // bool from mssql 0/1
  if (s === '0' || s === '1') {
    /* keep as string unless column expects bool — handled per-field */
  }
  s = s.replace(/'/g, "''");
  return `'${s}'`;
}

function uuid(v) {
  if (v == null) return 'NULL';
  return `'${String(v).toLowerCase()}'::uuid`;
}

function ts(v) {
  if (v == null || v === '') return 'NULL';
  // trim excess fractional digits for PG
  const s = String(v).replace(/(\.\d{6})\d+/, '$1');
  return `'${s}'::timestamptz`;
}

function jsonb(v) {
  if (v == null || v === '') return `'{}'::jsonb`;
  if (typeof v === 'object') return `${esc(JSON.stringify(v))}::jsonb`;
  // already JSON string
  try {
    JSON.parse(v);
    return `${esc(v)}::jsonb`;
  } catch {
    return `${esc(v)}::jsonb`;
  }
}

function bool01(v) {
  if (v === true || v === 1 || v === '1') return 'TRUE';
  return 'FALSE';
}

const lines = [];
lines.push('-- Datos migrados desde SQL Server → PostgreSQL');
lines.push('-- Ejecutar DESPUÉS de 001_schema.sql en la DB salta_delivery');
lines.push('-- Sin BEGIN/COMMIT para que un error no borre todo lo insertado');
lines.push('');

// USUARIOS
const usuarios = load('usuarios');
for (const u of usuarios) {
  lines.push(`INSERT INTO public.usuarios (
  id, numero_usuario, email, telefono, nombre, password_hash, rol, estado,
  telefono_verificado, fecha_registro, fecha_actualizacion
) VALUES (
  ${uuid(u.id)}, ${Number(u.numero_usuario)}, ${esc(u.email)}, ${esc(u.telefono)}, ${esc(u.nombre)},
  ${esc(u.password_hash)}, ${esc(u.rol)}, ${esc(u.estado)},
  ${bool01(u.telefono_verificado)}, ${ts(u.fecha_registro)}, ${ts(u.fecha_actualizacion)}
) ON CONFLICT (id) DO NOTHING;`);
}
lines.push(`SELECT setval(pg_get_serial_sequence('public.usuarios','numero_usuario'),
  COALESCE((SELECT MAX(numero_usuario) FROM public.usuarios), 1000));`);
lines.push('');

// CLIENTES
for (const c of load('clientes')) {
  lines.push(`INSERT INTO public.clientes (
  usuario_id, dni, plan_suscripcion, tipo_cuenta, tiempo_preparacion_min, horario_comercial,
  estado_suscripcion, fecha_inicio_suscripcion, fecha_fin_suscripcion,
  direccion, calle, numero, piso_dpto, barrio, ciudad, provincia, zona_h3, zona_nombre,
  direcciones_favoritas, fotos_documentos, metodo_pago_preferido,
  viajes_realizados, calificacion_promedio, puntos_fidelidad, fecha_creacion, fecha_actualizacion
) VALUES (
  ${uuid(c.usuario_id)}, ${esc(c.dni)}, ${esc(c.plan_suscripcion)}, ${esc(c.tipo_cuenta || 'particular')},
  ${Number(c.tiempo_preparacion_min || 0)}, ${c.horario_comercial ? jsonb(c.horario_comercial) : 'NULL'},
  ${esc(c.estado_suscripcion)}, ${ts(c.fecha_inicio_suscripcion)}, ${ts(c.fecha_fin_suscripcion)},
  ${esc(c.direccion)}, ${esc(c.calle)}, ${esc(c.numero)}, ${esc(c.piso_dpto)}, ${esc(c.barrio)},
  ${esc(c.ciudad)}, ${esc(c.provincia)}, ${esc(c.zona_h3)}, ${esc(c.zona_nombre)},
  ${jsonb(c.direcciones_favoritas || '[]')}, ${jsonb(c.fotos_documentos || '{}')},
  ${esc(c.metodo_pago_preferido || 'efectivo')},
  ${Number(c.viajes_realizados || 0)}, ${Number(c.calificacion_promedio || 5)}, ${Number(c.puntos_fidelidad || 0)},
  ${ts(c.fecha_creacion)}, ${ts(c.fecha_actualizacion)}
) ON CONFLICT (usuario_id) DO NOTHING;`);
}
lines.push('');

// CADETES (0 ok)
for (const c of load('cadetes')) {
  lines.push(`INSERT INTO public.cadetes (
  usuario_id, dni, licencia, patente, marca_moto, fecha_nacimiento,
  estado_verificacion, disponibilidad, ubicacion_lat, ubicacion_lng, ubicacion_actualizada_en,
  zona_actual, plan_suscripcion, estado_suscripcion, fecha_inicio_suscripcion, fecha_fin_suscripcion,
  comision_actual, total_viajes, total_ganado, calificacion_promedio,
  datos_moto, fotos_documentos, direccion, calle, numero, piso_dpto, barrio, ciudad, provincia,
  cbu, alias_bancario, banco, titular_cuenta, fecha_creacion, fecha_actualizacion
) VALUES (
  ${uuid(c.usuario_id)}, ${esc(c.dni)}, ${esc(c.licencia)}, ${esc(c.patente)}, ${esc(c.marca_moto)},
  ${esc(c.fecha_nacimiento)}::date, ${esc(c.estado_verificacion)}, ${esc(c.disponibilidad)},
  ${c.ubicacion_lat ?? 'NULL'}, ${c.ubicacion_lng ?? 'NULL'}, ${ts(c.ubicacion_actualizada_en)},
  ${esc(c.zona_actual)}, ${esc(c.plan_suscripcion)}, ${esc(c.estado_suscripcion)},
  ${ts(c.fecha_inicio_suscripcion)}, ${ts(c.fecha_fin_suscripcion)},
  ${Number(c.comision_actual)}, ${Number(c.total_viajes)}, ${Number(c.total_ganado)}, ${Number(c.calificacion_promedio)},
  ${jsonb(c.datos_moto || '{}')}, ${jsonb(c.fotos_documentos || '{}')},
  ${esc(c.direccion)}, ${esc(c.calle)}, ${esc(c.numero)}, ${esc(c.piso_dpto)}, ${esc(c.barrio)},
  ${esc(c.ciudad)}, ${esc(c.provincia)}, ${esc(c.cbu)}, ${esc(c.alias_bancario)}, ${esc(c.banco)}, ${esc(c.titular_cuenta)},
  ${ts(c.fecha_creacion)}, ${ts(c.fecha_actualizacion)}
) ON CONFLICT (usuario_id) DO NOTHING;`);
}
lines.push('');

// VIAJES
for (const v of load('viajes')) {
  lines.push(`INSERT INTO public.viajes (
  id, cliente_id, cadete_id, tipo_servicio, origen_direccion, origen_lat, origen_lng,
  destino_direccion, destino_lat, destino_lng, distancia_km, tiempo_estimado_min,
  tarifa_estimada, tarifa_final, comision_plataforma, pago_cadete, detalle_tarifa, estado,
  fecha_solicitud, fecha_asignacion, fecha_inicio, fecha_fin, fecha_cancelacion, motivo_cancelacion,
  metodo_pago, estado_pago, calificacion_cliente, comentario_cliente, calificacion_cadete, comentario_cadete,
  condiciones_clima, notas, tiempo_preparacion_min, listo_para_retiro_en, fecha_creacion, fecha_actualizacion
) VALUES (
  ${uuid(v.id)}, ${uuid(v.cliente_id)}, ${uuid(v.cadete_id)}, ${esc(v.tipo_servicio)},
  ${esc(v.origen_direccion)}, ${Number(v.origen_lat)}, ${Number(v.origen_lng)},
  ${esc(v.destino_direccion)}, ${Number(v.destino_lat)}, ${Number(v.destino_lng)},
  ${v.distancia_km ?? 'NULL'}, ${v.tiempo_estimado_min ?? 'NULL'},
  ${v.tarifa_estimada ?? 'NULL'}, ${v.tarifa_final ?? 'NULL'}, ${v.comision_plataforma ?? 'NULL'}, ${v.pago_cadete ?? 'NULL'},
  ${jsonb(v.detalle_tarifa)}, ${esc(v.estado)},
  ${ts(v.fecha_solicitud)}, ${ts(v.fecha_asignacion)}, ${ts(v.fecha_inicio)}, ${ts(v.fecha_fin)}, ${ts(v.fecha_cancelacion)},
  ${esc(v.motivo_cancelacion)}, ${esc(v.metodo_pago)}, ${esc(v.estado_pago)},
  ${v.calificacion_cliente ?? 'NULL'}, ${esc(v.comentario_cliente)}, ${v.calificacion_cadete ?? 'NULL'}, ${esc(v.comentario_cadete)},
  ${v.condiciones_clima ? jsonb(v.condiciones_clima) : 'NULL'}, ${esc(v.notas)},
  ${v.tiempo_preparacion_min ?? 'NULL'}, ${ts(v.listo_para_retiro_en)},
  ${ts(v.fecha_creacion)}, ${ts(v.fecha_actualizacion)}
) ON CONFLICT (id) DO NOTHING;`);
}
lines.push('');

// CONFIGURACIONES
for (const c of load('configuraciones')) {
  let valor = c.valor;
  if (typeof valor === 'string') {
    valor = valor.replace(/\r\n/g, '\n');
  }
  lines.push(`INSERT INTO public.configuraciones (clave, valor, descripcion, fecha_actualizacion)
VALUES (${esc(c.clave)}, ${jsonb(valor)}, ${esc(c.descripcion)}, ${ts(c.fecha_actualizacion)})
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, descripcion = EXCLUDED.descripcion;`);
}
lines.push('');

// ZONAS
for (const z of load('zonas_hexagonos')) {
  lines.push(`INSERT INTO public.zonas_hexagonos (
  id, h3_index, tipo, lat_centro, lng_centro, tarifa_multiplier, demanda_actual, activa, nombre,
  fecha_creacion, fecha_actualizacion
) VALUES (
  ${uuid(z.id)}, ${esc(z.h3_index)}, ${esc(z.tipo)}, ${Number(z.lat_centro)}, ${Number(z.lng_centro)},
  ${Number(z.tarifa_multiplier)}, ${Number(z.demanda_actual || 0)}, ${bool01(z.activa)}, ${esc(z.nombre)},
  ${ts(z.fecha_creacion)}, ${ts(z.fecha_actualizacion)}
) ON CONFLICT (h3_index) DO UPDATE SET
  tipo = EXCLUDED.tipo, lat_centro = EXCLUDED.lat_centro, lng_centro = EXCLUDED.lng_centro,
  tarifa_multiplier = EXCLUDED.tarifa_multiplier, nombre = EXCLUDED.nombre;`);
}
lines.push('');

// CONFIG COMISIONES
for (const c of load('config_comisiones')) {
  lines.push(`INSERT INTO public.config_comisiones (id, plan_cadete, tipo_servicio, comision_pct, fecha_creacion, fecha_actualizacion)
VALUES (${uuid(c.id)}, ${esc(c.plan_cadete)}, ${esc(c.tipo_servicio)}, ${Number(c.comision_pct)}, ${ts(c.fecha_creacion)}, ${ts(c.fecha_actualizacion)})
ON CONFLICT (plan_cadete, tipo_servicio) DO UPDATE SET comision_pct = EXCLUDED.comision_pct;`);
}
lines.push('');

// MEDIOS PAGO
for (const m of load('medios_pago_cliente')) {
  lines.push(`INSERT INTO public.medios_pago_cliente (
  id, usuario_id, tipo, alias, marca, ultimos_4, vencimiento_mes, vencimiento_anio, titular,
  mp_email, mp_alias, saldo, es_predeterminado, activo, fecha_creacion, fecha_actualizacion
) VALUES (
  ${uuid(m.id)}, ${uuid(m.usuario_id)}, ${esc(m.tipo)}, ${esc(m.alias)}, ${esc(m.marca)}, ${esc(m.ultimos_4)},
  ${m.vencimiento_mes ?? 'NULL'}, ${m.vencimiento_anio ?? 'NULL'}, ${esc(m.titular)},
  ${esc(m.mp_email)}, ${esc(m.mp_alias)}, ${Number(m.saldo || 0)}, ${bool01(m.es_predeterminado)}, ${bool01(m.activo)},
  ${ts(m.fecha_creacion)}, ${ts(m.fecha_actualizacion)}
) ON CONFLICT (id) DO NOTHING;`);
}
lines.push('');

// REPORTES
for (const r of load('reportes_guardados')) {
  let tipo = r.tipo || 'estadisticas';
  const allowed = ['estadisticas', 'comprobantes', 'viajes', 'financiero', 'operativo', 'actividad_cadetes'];
  if (!allowed.includes(tipo)) tipo = 'estadisticas';
  lines.push(`INSERT INTO public.reportes_guardados (
  id, tipo, titulo, generado_por, resumen_json, detalle_json, fecha_creacion
) VALUES (
  ${uuid(r.id)}, ${esc(tipo)}, ${esc(r.titulo)}, ${uuid(r.generado_por || r.admin_id)},
  ${jsonb(r.resumen_json || r.resumen || '{}')}, ${jsonb(r.detalle_json || r.filtros || '{}')},
  ${ts(r.fecha_creacion)}
) ON CONFLICT (id) DO NOTHING;`);
}
lines.push('');

// COMPROBANTE SEQ
const seq = load('comprobante_seq')[0];
if (seq) {
  lines.push(`INSERT INTO public.comprobante_seq (id, ultimo) VALUES (1, ${Number(seq.ultimo || 0)})
ON CONFLICT (id) DO UPDATE SET ultimo = EXCLUDED.ultimo;`);
}

lines.push('');
lines.push('-- Verificación');
lines.push('SELECT \'usuarios\' AS t, COUNT(*) FROM public.usuarios');
lines.push('UNION ALL SELECT \'clientes\', COUNT(*) FROM public.clientes');
lines.push('UNION ALL SELECT \'viajes\', COUNT(*) FROM public.viajes');
lines.push('UNION ALL SELECT \'zonas\', COUNT(*) FROM public.zonas_hexagonos');
lines.push('UNION ALL SELECT \'config\', COUNT(*) FROM public.configuraciones;');

fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log('Generado:', out);

/**
 * Exporta datos de SQL Server → JSON (listos para cargar en PostgreSQL).
 * Uso: node api/scripts/export-mssql-to-json.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../database/postgres/data-export');

const pool = await sql.connect({
  server: process.env.SQLSERVER_SERVER || 'localhost',
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DATABASE || 'salta_delivery',
  user: process.env.SQLSERVER_USER || 'salta_api',
  password: process.env.SQLSERVER_PASSWORD || 'SaltaApi2026!',
  options: { encrypt: true, trustServerCertificate: true },
});

fs.mkdirSync(outDir, { recursive: true });

async function q(label, query) {
  const r = await pool.request().query(query);
  const file = path.join(outDir, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(r.recordset, null, 2), 'utf8');
  console.log(`${label}: ${r.recordset.length} filas → ${file}`);
  return r.recordset.length;
}

await q(
  'usuarios',
  `SELECT CONVERT(nvarchar(36), id) AS id, numero_usuario, email, telefono, nombre,
          password_hash, rol, estado,
          CAST(telefono_verificado AS int) AS telefono_verificado,
          CONVERT(varchar(33), fecha_registro, 127) AS fecha_registro,
          CONVERT(varchar(33), fecha_actualizacion, 127) AS fecha_actualizacion
   FROM dbo.usuarios`,
);

await q(
  'clientes',
  `SELECT CONVERT(nvarchar(36), usuario_id) AS usuario_id, dni, plan_suscripcion,
          ISNULL(tipo_cuenta, N'particular') AS tipo_cuenta,
          ISNULL(tiempo_preparacion_min, 0) AS tiempo_preparacion_min,
          horario_comercial, estado_suscripcion,
          CONVERT(varchar(33), fecha_inicio_suscripcion, 127) AS fecha_inicio_suscripcion,
          CONVERT(varchar(33), fecha_fin_suscripcion, 127) AS fecha_fin_suscripcion,
          direccion, calle, numero, piso_dpto, barrio, ciudad, provincia,
          zona_h3, zona_nombre, direcciones_favoritas, fotos_documentos,
          ISNULL(metodo_pago_preferido, N'efectivo') AS metodo_pago_preferido,
          viajes_realizados, calificacion_promedio, puntos_fidelidad,
          CONVERT(varchar(33), fecha_creacion, 127) AS fecha_creacion,
          CONVERT(varchar(33), fecha_actualizacion, 127) AS fecha_actualizacion
   FROM dbo.clientes`,
);

await q(
  'cadetes',
  `SELECT CONVERT(nvarchar(36), usuario_id) AS usuario_id, dni, licencia, patente, marca_moto,
          CONVERT(varchar(10), fecha_nacimiento, 23) AS fecha_nacimiento,
          estado_verificacion, disponibilidad,
          ubicacion_actual.Lat AS ubicacion_lat, ubicacion_actual.Long AS ubicacion_lng,
          CONVERT(varchar(33), ubicacion_actualizada_en, 127) AS ubicacion_actualizada_en,
          zona_actual, plan_suscripcion, estado_suscripcion,
          CONVERT(varchar(33), fecha_inicio_suscripcion, 127) AS fecha_inicio_suscripcion,
          CONVERT(varchar(33), fecha_fin_suscripcion, 127) AS fecha_fin_suscripcion,
          comision_actual, total_viajes, total_ganado, calificacion_promedio,
          datos_moto, fotos_documentos, direccion, calle, numero, piso_dpto, barrio, ciudad, provincia,
          cbu, alias_bancario, banco, titular_cuenta,
          CONVERT(varchar(33), fecha_creacion, 127) AS fecha_creacion,
          CONVERT(varchar(33), fecha_actualizacion, 127) AS fecha_actualizacion
   FROM dbo.cadetes`,
);

await q(
  'viajes',
  `SELECT CONVERT(nvarchar(36), id) AS id,
          CONVERT(nvarchar(36), cliente_id) AS cliente_id,
          CONVERT(nvarchar(36), cadete_id) AS cadete_id,
          tipo_servicio, origen_direccion,
          origen_ubicacion.Lat AS origen_lat, origen_ubicacion.Long AS origen_lng,
          destino_direccion,
          destino_ubicacion.Lat AS destino_lat, destino_ubicacion.Long AS destino_lng,
          distancia_km, tiempo_estimado_min, tarifa_estimada, tarifa_final,
          comision_plataforma, pago_cadete, detalle_tarifa, estado,
          CONVERT(varchar(33), fecha_solicitud, 127) AS fecha_solicitud,
          CONVERT(varchar(33), fecha_asignacion, 127) AS fecha_asignacion,
          CONVERT(varchar(33), fecha_inicio, 127) AS fecha_inicio,
          CONVERT(varchar(33), fecha_fin, 127) AS fecha_fin,
          CONVERT(varchar(33), fecha_cancelacion, 127) AS fecha_cancelacion,
          motivo_cancelacion, metodo_pago, estado_pago,
          calificacion_cliente, comentario_cliente, calificacion_cadete, comentario_cadete,
          condiciones_clima, notas,
          tiempo_preparacion_min,
          CONVERT(varchar(33), listo_para_retiro_en, 127) AS listo_para_retiro_en,
          CONVERT(varchar(33), fecha_creacion, 127) AS fecha_creacion,
          CONVERT(varchar(33), fecha_actualizacion, 127) AS fecha_actualizacion
   FROM dbo.viajes`,
);

await q('configuraciones', `SELECT clave, valor, descripcion,
  CONVERT(varchar(33), fecha_actualizacion, 127) AS fecha_actualizacion FROM dbo.configuraciones`);

await q(
  'zonas_hexagonos',
  `SELECT CONVERT(nvarchar(36), id) AS id, h3_index, tipo, lat_centro, lng_centro,
          tarifa_multiplier, demanda_actual,
          CAST(activa AS int) AS activa, nombre,
          CONVERT(varchar(33), fecha_creacion, 127) AS fecha_creacion,
          CONVERT(varchar(33), fecha_actualizacion, 127) AS fecha_actualizacion
   FROM dbo.zonas_hexagonos`,
);

await q('config_comisiones', `SELECT * FROM dbo.config_comisiones`);
await q('medios_pago_cliente', `SELECT * FROM dbo.medios_pago_cliente`);
await q('reportes_guardados', `SELECT * FROM dbo.reportes_guardados`);
await q('comprobante_seq', `SELECT * FROM dbo.comprobante_seq`);
await q('comprobantes', `SELECT * FROM dbo.comprobantes`);

await pool.close();
console.log('Export OK →', outDir);

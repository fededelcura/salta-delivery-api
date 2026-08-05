import 'dotenv/config';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cfg = {
  server: process.env.SQLSERVER_SERVER,
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DATABASE,
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

const pool = await sql.connect(cfg);

const zones = [
  ['88a8a0a2bffffff', 'centro', -24.7821, -65.4232, 1.2, 'Centro Cívico'],
  ['88a8a0a33ffffff', 'comercial', -24.789, -65.41, 1.15, 'Shopping'],
  ['88a8a0a37ffffff', 'residencial', -24.77, -65.43, 1.0, 'Tres Cerritos'],
  ['88a8a0a3bffffff', 'residencial', -24.8, -65.435, 1.0, 'Grand Bourg'],
  ['88a8a0a2fffffff', 'periferia', -24.85, -65.45, 1.05, 'Límite Sur'],
  ['88a8a0a23ffffff', 'aeropuerto', -24.844, -65.48, 1.25, 'Aeropuerto Martín Miguel de Güemes'],
];

for (const [h3, tipo, lat, lng, mult, nombre] of zones) {
  await pool
    .request()
    .input('h3', sql.NVarChar(64), h3)
    .input('tipo', sql.NVarChar(20), tipo)
    .input('lat', sql.Float, lat)
    .input('lng', sql.Float, lng)
    .input('mult', sql.Decimal(5, 2), mult)
    .input('nombre', sql.NVarChar(100), nombre)
    .query(`
      MERGE dbo.zonas_hexagonos AS t
      USING (SELECT @h3 AS h3_index) AS s ON t.h3_index = s.h3_index
      WHEN MATCHED THEN
        UPDATE SET tipo=@tipo, lat_centro=@lat, lng_centro=@lng,
                   tarifa_multiplier=@mult, nombre=@nombre, activa=1,
                   fecha_actualizacion=SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT (h3_index, tipo, lat_centro, lng_centro, tarifa_multiplier, nombre, activa)
        VALUES (@h3, @tipo, @lat, @lng, @mult, @nombre, 1);
    `);
  console.log('upsert', nombre, 'x' + mult);
}

const r = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.zonas_hexagonos`);
console.log('total zonas', r.recordset[0].n);
await pool.close();

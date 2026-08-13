import { getPool, closePool, sql } from '../src/config/database.ts';
import { adminModel } from '../src/models/admin.model.ts';
import { comisionModel } from '../src/models/facturacion.model.ts';

const cfg = await adminModel.getConfig('tarifas.base');
console.log('getConfig ok', cfg);

const next = await adminModel.setTarifasBase({
  base_fija: Number(cfg.base_fija) || 600,
  precio_km: Number(cfg.precio_km) || 350,
  precio_minuto: Number(cfg.precio_minuto) || 100,
});
console.log('setTarifasBase ok', next);

const rows = await comisionModel.listar();
console.log('comisiones', rows.length);
if (rows[0]) {
  await comisionModel.upsertMany(
    rows.map((r) => ({
      plan_cadete: r.plan_cadete,
      tipo_servicio: r.tipo_servicio,
      comision_pct: Number(r.comision_pct),
    })),
  );
  console.log('upsertComisiones ok');
}

await closePool();

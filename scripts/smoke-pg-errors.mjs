import { getPool, closePool, sql } from '../src/config/database.ts';
import { adminModel } from '../src/models/admin.model.ts';
import { viajeModel } from '../src/models/viaje.model.ts';
import { cadeteActividadModel } from '../src/models/cadete_actividad.model.ts';
import { cadeteModel } from '../src/models/cadete.model.ts';
import { comprobanteModel } from '../src/models/facturacion.model.ts';

const dash = await adminModel.dashboard();
console.log('dashboard ok', dash.viajes_hoy, dash.clientes_activos);

const reportes = await adminModel.reportes({ dias: 30 });
console.log('reportes ok', reportes.totales?.viajes);

const viajes = await viajeModel.listar({ page: 1, pageSize: 20 });
console.log('viajes ok', viajes.total);

const hoy = new Date();
const desde = new Date(hoy);
desde.setDate(hoy.getDate() - 7);
const act = await cadeteActividadModel.estadisticas({
  desde: desde.toISOString().slice(0, 10),
  hasta: hoy.toISOString().slice(0, 10),
});
console.log('actividad ok', act.trabajando?.length ?? Object.keys(act).length);

const comps = await comprobanteModel.listarAdmin({ page: 1, pageSize: 20 });
console.log('comprobantes ok', comps.total);

// setVerificacion multi-query path (no create)
const cads = await cadeteModel.listarAdmin(1, 5);
if (cads.items[0]) {
  const est = cads.items[0].estado_verificacion;
  if (est === 'aprobado' || est === 'rechazado' || est === 'suspendido' || est === 'en_revision') {
    await cadeteModel.setVerificacion(cads.items[0].usuario_id, est);
    console.log('setVerificacion ok');
  } else {
    console.log('setVerificacion skipped (estado)', est);
  }
} else {
  console.log('setVerificacion skipped (sin cadetes)');
}

await closePool();
console.log('ALL OK');

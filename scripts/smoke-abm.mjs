import { getPool, closePool } from '../src/config/database.ts';
import { adminModel } from '../src/models/admin.model.ts';
import { zonaModel } from '../src/models/zona.model.ts';
import { clienteModel } from '../src/models/cliente.model.ts';

const tarifas = await adminModel.getTarifasBase();
console.log('tarifas', tarifas.base_fija, tarifas.precio_km);

const planes = await adminModel.getPlanes();
console.log('planes cliente', planes.cliente.length, 'cadete', planes.cadete.length);

const zonas = await zonaModel.listar(true);
console.log('zonas', zonas.length, zonas[0]?.nombre);

const clientes = await clienteModel.listar(1, 50);
const c = clientes.items[0];
if (c) {
  const baja = await clienteModel.darDeBaja(c.usuario_id);
  console.log('baja', baja.estado);
  const act = await clienteModel.reactivar(c.usuario_id);
  console.log('reactivar', act.estado);
}

await closePool();
console.log('ABM smoke OK');

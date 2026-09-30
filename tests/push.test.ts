import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PushService, type EnviadorPush } from '../src/services/push.service.js';

const SUBS = [
  { id: 'a', endpoint: 'https://push.example/a', p256dh: 'k', auth: 'x' },
  { id: 'b', endpoint: 'https://push.example/b', p256dh: 'k', auth: 'x' },
];

function poolFalso() {
  const consultas: { sql: string; params: Record<string, unknown> }[] = [];
  const pool = {
    request() {
      const params: Record<string, unknown> = {};
      const req = {
        input(nombre: string, _tipo: unknown, valor: unknown) {
          params[nombre] = valor;
          return req;
        },
        async query(sql: string) {
          consultas.push({ sql, params });
          return { recordset: sql.includes('SELECT') ? SUBS : [] };
        },
      };
      return req;
    },
  };
  return { consultas, getPool: async () => pool as never };
}

const PAYLOAD = { titulo: 't', cuerpo: 'c', tag: 'viaje-1', url: '/#/cadete/viajes' };

test('410 borra la suscripción y 201 actualiza ultimo_envio', async () => {
  const db = poolFalso();
  const enviar: EnviadorPush = async (sub) => (sub.id === 'a' ? 410 : 201);
  const svc = new PushService({ enviar, pool: db.getPool, habilitado: () => true });

  assert.deepEqual(await svc.enviarAUsuario('u1', PAYLOAD), { enviados: 1, borrados: 1 });
  const borrado = db.consultas.find((q) => q.sql.includes('DELETE'));
  const actualizado = db.consultas.find((q) => q.sql.includes('ultimo_envio'));
  assert.equal(borrado?.params.id, 'a');
  assert.equal(actualizado?.params.id, 'b');
});

test('un error de red no corta el envío a las demás suscripciones', async () => {
  const db = poolFalso();
  const enviar: EnviadorPush = async (sub) => {
    if (sub.id === 'a') throw new Error('ECONNRESET');
    return 201;
  };
  const svc = new PushService({ enviar, pool: db.getPool, habilitado: () => true });

  assert.deepEqual(await svc.enviarAUsuario('u1', PAYLOAD), { enviados: 1, borrados: 0 });
});

test('sin claves VAPID no consulta ni envía', async () => {
  const db = poolFalso();
  let llamadas = 0;
  const svc = new PushService({
    enviar: async () => (llamadas++, 201),
    pool: db.getPool,
    habilitado: () => false,
  });

  assert.deepEqual(await svc.enviarAUsuario('u1', PAYLOAD), { enviados: 0, borrados: 0 });
  assert.equal(llamadas, 0);
  assert.equal(db.consultas.length, 0);
  assert.throws(() => svc.clavePublica(), /no disponibles/);
});

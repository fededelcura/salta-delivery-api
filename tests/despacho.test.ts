import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANILLOS_DEFAULT, radioParaEdad } from '../src/services/despacho.service.js';

test('radio del anillo según la antigüedad del pedido', () => {
  assert.equal(radioParaEdad(ANILLOS_DEFAULT, 0), 3);
  assert.equal(radioParaEdad(ANILLOS_DEFAULT, 30_000), 3);
  assert.equal(radioParaEdad(ANILLOS_DEFAULT, 90_000), 6);
  assert.equal(radioParaEdad(ANILLOS_DEFAULT, 3 * 60_000), 10);
  assert.equal(radioParaEdad(ANILLOS_DEFAULT, 60 * 60_000), 10);
});

test('antigüedad negativa (reloj adelantado) usa el primer anillo', () => {
  assert.equal(radioParaEdad(ANILLOS_DEFAULT, -5_000), 3);
});

test('configuración con un solo radio', () => {
  assert.equal(radioParaEdad({ radios_km: [8], paso_seg: 30 }, 10 * 60_000), 8);
});

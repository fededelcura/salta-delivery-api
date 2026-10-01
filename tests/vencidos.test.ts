import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIAJE_VISIBLE_MS, TIMEOUT_SIN_ACEPT_MS, MOTIVO_VENCIDO } from '../src/models/viaje.model.js';

test('los pedidos vencen a los 30 min, después de escalar a los 5', () => {
  assert.equal(VIAJE_VISIBLE_MS, 30 * 60_000);
  assert.ok(VIAJE_VISIBLE_MS > TIMEOUT_SIN_ACEPT_MS);
});

test('el motivo de vencido empieza como lo detecta la web del cliente', () => {
  assert.ok(MOTIVO_VENCIDO.startsWith('Sin cadete disponible'));
});

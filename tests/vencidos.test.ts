import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIAJE_VISIBLE_MS, TIMEOUT_SIN_ACEPT_MS } from '../src/models/viaje.model.js';

test('los pedidos dejan de verse a los 30 min, después de escalar a los 5', () => {
  assert.equal(VIAJE_VISIBLE_MS, 30 * 60_000);
  assert.ok(VIAJE_VISIBLE_MS > TIMEOUT_SIN_ACEPT_MS);
});

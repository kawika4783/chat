import assert from 'node:assert/strict';
import test from 'node:test';
import { createClientId } from '../src/clientId.js';

test('createClientId uses randomUUID when available', () => {
  const clientId = createClientId({ randomUUID: () => '12345678-1234-1234-1234-123456789abc' });

  assert.equal(clientId, '12345678123412341234123456789abc');
});

test('createClientId supports browsers without randomUUID', () => {
  const clientId = createClientId({
    getRandomValues: bytes => {
      bytes.fill(10);
      return bytes;
    },
  });

  assert.equal(clientId, '0a'.repeat(16));
  assert.match(clientId, /^[A-Za-z0-9_-]{8,100}$/);
});

test('createClientId has a last-resort compatible fallback', () => {
  const clientId = createClientId(undefined);

  assert.match(clientId, /^[A-Za-z0-9_-]{8,100}$/);
});

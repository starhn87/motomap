import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { loadModule } from './helpers/loadModule';
test('fresh external rechecks renew evidence across windows; DB changes never reuse an old plan', async () => {
  const { placeChangeFingerprint: hash } = loadModule<{
    placeChangeFingerprint(id: string, current: object, observed: object, changes: string[], now: number): Promise<string>;
  }>('supabase/functions/_shared/placeChangeFingerprint.ts', {}, { crypto: webcrypto, TextEncoder });
  const week = 7 * 24 * 60 * 60 * 1000;
  const first = await hash('id', { address: 'old' }, { address: 'new' }, ['moved'], 1);
  assert.equal(first, await hash('id', { address: 'old' }, { address: 'new' }, ['moved'], week - 1));
  assert.notEqual(first, await hash('id', { address: 'old' }, { address: 'new' }, ['moved'], week));
  assert.notEqual(first, await hash('id', { address: 'changed by operator' }, { address: 'new' }, ['moved'], 1));
  assert.notEqual(first, await hash('other-id', { address: 'old' }, { address: 'new' }, ['moved'], 1));
});

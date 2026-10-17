import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers/loadModule';
test('detail distinguishes confirmed disappearance from temporary lookup failure', async () => {
  let response: unknown = { data: [], error: null };
  const api = loadModule<{ fetchPlaceById(id: string): Promise<unknown> }>('hooks/usePlace.ts', {
    '@tanstack/react-query': { useQuery() {} },
    '@/lib/supabase': { supabase: { rpc: async () => response } },
    '@/lib/api/places': { rowToPlace: (row: unknown) => row },
    '@/lib/queryKeys': { queryKeys: {} },
  });
  assert.equal(await api.fetchPlaceById('place'), null);
  response = { data: null, error: new Error('temporary') };
  await assert.rejects(() => api.fetchPlaceById('place'), /temporary/);
  response = { data: [{ id: 'place', address: 'new', latitude: 37 }], error: null };
  const row = await api.fetchPlaceById('place') as { address: string };
  assert.equal(row.address, 'new');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers/loadModule';

function fixture() {
  let listener: (state: string) => void = () => {};
  let nextTimer: (() => void) | undefined;
  let result: unknown = { data: '1', error: null };
  let calls = 0;
  let removed = false;
  let failRefresh = false;
  const invalidated: string[] = [];
  const state = { currentState: 'active', addEventListener: (_: string, fn: typeof listener) => {
    listener = fn; return { remove() { removed = true; } };
  } };
  const module = loadModule<{ startPlaceCatalogSync(client: unknown): () => void }>(
    'lib/placeCatalogSync.ts', {
      'react-native': { AppState: state },
      '@/lib/placeCatalogSuppression': { replacePlaceCatalogSuppressions: (value: unknown) => Array.isArray(value) },
      '@/lib/supabase': { supabase: { rpc: (name: string) => ({ abortSignal: async () => { if (name === 'get_place_catalog_suppressions') return { data: [], error: null }; calls++; return result; } }) } },
    }, {
      setTimeout: (fn: () => void, delay: number) => { if (delay !== 10_000) nextTimer = fn; return delay; },
      clearTimeout: (id: number) => { if (id !== 10_000) nextTimer = undefined; },
      AbortController,
    });
  const stop = module.startPlaceCatalogSync({ invalidateQueries: async ({ queryKey }: { queryKey: string[] }) => {
    invalidated.push(queryKey[0]);
    if (failRefresh) throw new Error('temporary');
  } });
  return { stop, invalidated, setFailRefresh(value: boolean) { failRefresh = value; }, setResult(value: unknown) { result = value; },
    change(value: string) { state.currentState = value; listener(value); },
    tick() { const fn = nextTimer; nextTimer = undefined; fn?.(); },
    get calls() { return calls; }, get removed() { return removed; },
  };
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

test('first revision refreshes warm cache, same revision does not, changed revision does', async () => {
  const f = fixture(); await flush();
  assert.equal(f.invalidated.length, 8);
  f.tick(); await flush(); assert.equal(f.invalidated.length, 8);
  f.setResult({ data: '9007199254740993', error: null });
  f.tick(); await flush(); assert.equal(f.invalidated.length, 16);
  f.stop();
});
test('background pauses requests; foreground refreshes; disposal removes subscription', async () => {
  const f = fixture(); await flush();
  f.change('background'); f.tick(); await flush(); assert.equal(f.calls, 1);
  f.change('active'); await flush(); assert.equal(f.calls, 2);
  f.stop(); assert.equal(f.removed, true);
  f.tick(); f.change('active'); await flush(); assert.equal(f.calls, 2);
});
test('missing RPC and invalid values retain cache and retry later', async () => {
  const f = fixture(); await flush(); f.invalidated.length = 0;
  for (const value of [{ data: null, error: {} }, { data: 2, error: null }, { data: 'oops', error: null }]) {
    f.setResult(value); f.tick(); await flush();
  }
  assert.equal(f.invalidated.length, 0);
  f.setResult({ data: '2', error: null }); f.tick(); await flush();
  assert.equal(f.invalidated.length, 8); f.stop();
});

test('failed active refetch is retried even when catalog revision stays unchanged', async () => {
  const f = fixture(); await flush(); f.invalidated.length = 0;
  f.setResult({ data: '2', error: null }); f.setFailRefresh(true);
  f.tick(); await flush(); assert.equal(f.invalidated.length, 8);
  f.setFailRefresh(false); f.tick(); await flush(); assert.equal(f.invalidated.length, 16);
  f.tick(); await flush(); assert.equal(f.invalidated.length, 16); f.stop();
});

test('revision refreshes an active warm detail with the installed React Query client', async () => {
  const { QueryClient, QueryObserver } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['place', 'closed'], { id: 'closed', name: 'old' });
  const observer = new QueryObserver(client, { queryKey: ['place', 'closed'], queryFn: async () => null, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  const state = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const module = loadModule<{ startPlaceCatalogSync(client: unknown): () => void }>('lib/placeCatalogSync.ts', {
    'react-native': { AppState: state },
    '@/lib/placeCatalogSuppression': { replacePlaceCatalogSuppressions: () => true },
    '@/lib/supabase': { supabase: { rpc: (name: string) => ({ abortSignal: async () => ({ data: name==='get_place_catalog_revision' ? '7' : [], error: null }) }) } },
  }, { AbortController });
  const stop = module.startPlaceCatalogSync(client);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(client.getQueryData(['place', 'closed']), null);
  stop(); unsubscribe(); client.clear();
});

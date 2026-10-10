import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';
import { persist, type StorageValue } from 'zustand/middleware';

test('취소된 이전 조회는 낙관적으로 반영한 캐시를 덮어쓰지 않는다', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  let resolve!: (value: string) => void;
  const response = new Promise<string>((done) => { resolve = done; });
  const pending = queryClient.fetchQuery({ queryKey: ['compatibility'], queryFn: () => response });
  const settled = pending.catch(() => {});
  await queryClient.cancelQueries({ queryKey: ['compatibility'] });
  queryClient.setQueryData(['compatibility'], 'optimistic');
  resolve('old-response');
  await settled;
  assert.equal(queryClient.getQueryData(['compatibility']), 'optimistic');
  queryClient.clear();
});

test('persist 저장소를 비운 뒤 늦은 복원 값이 상태를 되살리지 않는다', async () => {
  let resolve!: (value: StorageValue<{ value: string }>) => void;
  const stored = new Promise<StorageValue<{ value: string }>>((done) => { resolve = done; });
  const store = createStore(persist(() => ({ value: 'current' }), {
    name: 'compatibility',
    skipHydration: true,
    storage: { getItem: () => stored, setItem: () => {}, removeItem: () => {} },
  }));
  const hydration = store.persist.rehydrate();
  store.persist.clearStorage();
  resolve({ state: { value: 'stale' }, version: 0 });
  await hydration;
  assert.equal(store.getState().value, 'current');
});

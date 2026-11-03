import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function fixture() {
  const cache = new Map<string, any>();
  const invalidations: any[] = [], errors: string[] = [];
  const key = (value: any) => JSON.stringify(value);
  const client = {
    cancelQueries: async () => {},
    getQueryData: (value: any) => cache.get(key(value)),
    setQueryData: (value: any, update: any) => cache.set(key(value), typeof update === 'function' ? update(cache.get(key(value))) : update),
    invalidateQueries: ({ queryKey }: any) => invalidations.push(queryKey),
  };
  const module = loadModule<any>('hooks/useActivityActions.ts', {
    '@tanstack/react-query': { useQueryClient: () => client, useMutation: (options: any) => options, useQuery: (options: any) => options },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user: { id: 'a' } }) },
    '@/lib/api/activity': { deleteNotification() {}, dismissSubmission() {}, fetchActivityDismissals() {} },
    '@/lib/api/reviews': { deleteReview() {} }, '@/lib/auth': { requireUser: async () => ({ id: 'a' }) },
    '@/lib/toast': { toast: { error: (message: string) => errors.push(message) } },
  });
  return { module, client, invalidations, errors };
}

test('알림 삭제는 즉시 반영하고 실패한 한 행만 복원해 다른 삭제를 되살리지 않는다', async () => {
  const { module, client, invalidations, errors } = fixture();
  const key = ['notifications', 'a'];
  client.setQueryData(key, [{ id: 'one', createdAt: '2026-11-04' }, { id: 'two', createdAt: '2026-11-03' }]);
  const action = module.useDeleteActivityNotification();
  const first = { userId: 'a', id: 'one' }, second = { userId: 'a', id: 'two' };
  const context = await action.onMutate(first); await action.onMutate(second);
  assert.deepEqual(Array.from(client.getQueryData(key)), []);
  action.onError(new Error(), first, context);
  assert.deepEqual(Array.from(client.getQueryData(key), (row: any) => row.id), ['one']);
  action.onSettled(null, null, first);
  assert.deepEqual(Array.from(invalidations[0]), key); assert.equal(errors.length, 1);
  assert.equal(client.getQueryData(['notifications', 'b']), undefined);
});

test('제보 숨김 실패는 해당 종류·ID만 되돌리며 원본 제보 캐시는 수정하지 않는다', async () => {
  const { module, client } = fixture();
  client.setQueryData(['my-submissions', 'a'], [{ id: 'one' }]);
  const action = module.useDismissSubmission();
  const first = { userId: 'a', kind: 'place_submission', id: 'one' };
  await action.onMutate(first);
  await action.onMutate({ userId: 'a', kind: 'feedback', id: 'two' });
  action.onError(new Error(), first);
  assert.deepEqual(Array.from(client.getQueryData(['activity-dismissals', 'a']), (row: any) => row.target_id), ['two']);
  assert.equal(client.getQueryData(['my-submissions', 'a'])[0].id, 'one');
});

test('리뷰 삭제 실패 복원은 다른 페이지·삭제를 보존하고 상세·집계 캐시를 갱신한다', async () => {
  const { module, client, invalidations } = fixture();
  const one = { id: 'one', targetKind: 'general', placeId: 'g' }, two = { id: 'two', targetKind: 'place', placeId: 'p' };
  client.setQueryData(['my-reviews', 'a'], { pages: [[one], [two]], pageParams: [0, 1] });
  const action = module.useDeleteActivityReview();
  const first = { userId: 'a', review: one };
  const context = await action.onMutate(first);
  await action.onMutate({ userId: 'a', review: two });
  action.onError(new Error(), first, context);
  const data = client.getQueryData(['my-reviews', 'a']);
  assert.equal(data.pages[0][0].id, 'one'); assert.equal(data.pages[1].length, 0);
  assert.deepEqual(data.pageParams, [0, 1]);
  action.onSettled(null, null, first);
  assert.ok(invalidations.some((value: any) => JSON.stringify(value) === JSON.stringify(['reviews', 'general', 'g'])));
  assert.ok(invalidations.some((value: any) => value[0] === 'general-place'));
  await assert.rejects(action.mutationFn({ userId: 'b', review: two }), /계정/);
});

test('숨김 API는 1000행 제한을 넘겨 조회하며 계정 변경 후 삭제·숨김 쓰기를 차단한다', async () => {
  let actor = 'a', writes = 0;
  const pages: any[] = [];
  const chain: any = {
    select: () => chain, eq: () => chain, order: () => chain,
    range: async (from: number, to: number) => {
      pages.push([from, to]); return { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ kind: 'feedback', target_id: String(i) })) : [] };
    },
    upsert: async () => { writes++; return {}; }, delete: () => { writes++; return chain; },
  };
  const module = loadModule<any>('lib/api/activity.ts', {
    '@/lib/supabase': { supabase: { from: () => chain } }, '@/lib/auth': { requireUser: async () => ({ id: actor }) },
  });
  assert.equal((await module.fetchActivityDismissals('a')).length, 1000);
  assert.deepEqual(pages, [[0, 999], [1000, 1999]]);
  await module.dismissSubmission({ userId: 'a', kind: 'feedback', id: 'one' }); assert.equal(writes, 1);
  actor = 'b';
  await assert.rejects(module.dismissSubmission({ userId: 'a', kind: 'feedback', id: 'one' }), /계정/);
  await assert.rejects(module.deleteNotification({ userId: 'a', id: 'one' }), /계정/);
  assert.equal(writes, 1);
});

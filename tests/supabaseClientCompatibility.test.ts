import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

// 외부 DB를 열지 않고 클라이언트 요청·취소 계약만 확인한다. RLS·실제 데이터 검증은 별도다.
function client(fetch: typeof globalThis.fetch) {
  return createClient('https://compatibility.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

test('프로필 조회와 RPC 요청의 기존 PostgREST 계약을 유지한다', async () => {
  const urls: URL[] = [];
  const supabase = client(async (input) => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify([{ nickname: '테스트' }]), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const result = await supabase.from('profiles').select('nickname').eq('id', 'test-user');
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [{ nickname: '테스트' }]);
  assert.equal(urls[0].pathname, '/rest/v1/profiles');
  assert.equal(urls[0].searchParams.get('id'), 'eq.test-user');
  await supabase.rpc('all_places');
  assert.equal(urls[1].pathname, '/rest/v1/rpc/all_places');
});

test('명시적인 timeout 취소를 자동 재요청으로 되살리지 않는다', async () => {
  let calls = 0;
  const controller = new AbortController();
  const supabase = client(async () => {
    calls += 1;
    controller.abort(new DOMException('test timeout', 'TimeoutError'));
    throw new DOMException('test timeout', 'TimeoutError');
  });
  const result = await supabase.from('profiles').select('nickname').abortSignal(controller.signal);
  assert.equal(result.data, null);
  assert.ok(result.error);
  assert.equal(calls, 1);
});

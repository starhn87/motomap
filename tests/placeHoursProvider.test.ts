import assert from 'node:assert/strict';
import test from 'node:test';
import { FunctionsClient } from '@supabase/functions-js';
import * as providerErrors from '../lib/providerErrors';
import { loadModule } from './helpers/loadModule';

function setup(status = 200, hangs = false) {
  let timeout: number | undefined, aborted = false;
  const client = new FunctionsClient('https://fixture.invalid', { customFetch: async (_url, options) => {
    if (hangs) return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('stopped', 'AbortError')); }));
    return new Response(JSON.stringify(status === 200 ? { hours: null, businessStatus: null } : { error: 'private upstream details should not escape' }), { status, headers: { 'Content-Type': 'application/json' } });
  } });
  const api = loadModule<any>('lib/api/placeHours.ts', {
    '@/lib/providerErrors': providerErrors,
    '@/lib/supabase': { supabase: { functions: { invoke: (name: string, args: any) => { timeout = args.timeout; return client.invoke(name, { ...args, timeout: hangs ? 20 : args.timeout }); } } } },
  });
  return { api, timeout: () => timeout, aborted: () => aborted };
}
const point = { sourceKey: 'test', name: '테스트', latitude: 37, longitude: 127 };
test('영업시간 정상 미등록은 null 시간표로 유지하고 서버 오류는 쿼리 실패로 구분한다', async () => {
  const normal = setup();
  const data = await normal.api.fetchPlaceHours(point);
  assert.equal(data.hours, null); assert.equal(data.businessStatus, null); assert.equal(normal.timeout(), 15000);
  const failed = setup(502);
  await assert.rejects(failed.api.fetchPlaceHours(point), (error: any) => error instanceof providerErrors.ProviderError && error.kind === 'temporary' && !error.message.includes('private'));
});
test('응답이 멈춘 영업시간 요청은 중지하고 무한 로딩으로 남기지 않는다', async () => {
  const hung = setup(200, true);
  await assert.rejects(hung.api.fetchPlaceHours(point), (error: any) => error instanceof providerErrors.ProviderError);
  assert.equal(hung.aborted(), true);
});

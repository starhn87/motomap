import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function fixture(result: { data?: unknown; error?: unknown } = { data: true, error: null }, ready = true) {
  const calls: { name: string; version: string; signal?: AbortSignal }[] = [];
  const api = loadModule<{
    currentLegalVersion: () => string;
    hasCurrentLegalConsent: () => Promise<boolean>;
    acceptCurrentLegalDocuments: () => Promise<void>;
  }>('lib/legalConsent.ts', {
    '@/constants/legal': { LEGAL_RELAUNCH_READY: ready, LEGAL_PUBLICATION: { consentVersion: '2026-10-11' } },
    '@/lib/supabase': { supabase: { rpc(name: string, args: { p_version: string }) {
      const call = { name, version: args.p_version, signal: undefined as AbortSignal | undefined };
      calls.push(call);
      return { abortSignal(signal: AbortSignal) { call.signal = signal; return Promise.resolve(result); } };
    } } },
  }, { AbortController });
  return { api, calls };
}

test('새 동의 조회·저장은 현재 버전과 중단 신호를 전송하고 사용자 ID·시각은 보내지 않는다', async () => {
  const { api, calls } = fixture();
  assert.equal(await api.hasCurrentLegalConsent(), true);
  await api.acceptCurrentLegalDocuments();
  assert.deepEqual(calls.map(({ name, version }) => ({ name, version })), [
    { name: 'has_accepted_legal_documents', version: '2026-10-11' },
    { name: 'accept_legal_documents', version: '2026-10-11' },
  ]);
  assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
});

test('미동의·잘못된 응답·저장 실패를 동의 완료로 간주하지 않는다', async () => {
  assert.equal(await fixture({ data: false }).api.hasCurrentLegalConsent(), false);
  await assert.rejects(fixture({ data: null }).api.hasCurrentLegalConsent());
  await assert.rejects(fixture({ error: new Error('denied') }).api.acceptCurrentLegalDocuments());
});

test('시행 준비가 안 된 버전을 요청하지 않는다', async () => {
  const { api, calls } = fixture(undefined, false);
  assert.throws(api.currentLegalVersion);
  await assert.rejects(api.hasCurrentLegalConsent());
  assert.equal(calls.length, 0);
});

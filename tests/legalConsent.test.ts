import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function fixture(result: { data?: unknown; error?: unknown } = { data: true, error: null }, ready = true) {
  const calls: { name: string; version: string; signal?: AbortSignal; authorization?: string }[] = [];
  const api = loadModule<{
    currentLegalVersion: () => string;
    hasCurrentLegalConsent: () => Promise<boolean>;
    acceptCurrentLegalDocuments: (session: {access_token:string;user:{id:string}}) => Promise<void>;
  }>('lib/legalConsent.ts', {
    '@/constants/legal': { LEGAL_RELAUNCH_READY: ready, LEGAL_PUBLICATION: { consentVersion: '2026-10-11' } },
    '@/lib/supabase': { supabase: { rpc(name: string, args: { p_version: string }) {
      const call = { name, version: args.p_version, signal: undefined as AbortSignal | undefined,authorization:undefined as string | undefined };
      calls.push(call);
      return {setHeader(_name:string,value:string){call.authorization=value;return this;},
        abortSignal(signal: AbortSignal) { call.signal = signal; return Promise.resolve(result); } };
    } } },
  }, { AbortController });
  return { api, calls };
}

test('새 동의 조회·저장은 현재 버전과 중단 신호를 전송하고 사용자 ID·시각은 보내지 않는다', async () => {
  const { api, calls } = fixture();
  assert.equal(await api.hasCurrentLegalConsent(), true);
  await api.acceptCurrentLegalDocuments({access_token:'test-token-A',user:{id:'A'}});
  assert.deepEqual(calls.map(({ name, version }) => ({ name, version })), [
    { name: 'has_accepted_legal_documents', version: '2026-10-11' },
    { name: 'accept_legal_documents', version: '2026-10-11' },
  ]);
  assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
  assert.equal(calls[1].authorization,'Bearer test-token-A');
});

test('미동의·잘못된 응답·저장 실패를 동의 완료로 간주하지 않는다', async () => {
  assert.equal(await fixture({ data: false }).api.hasCurrentLegalConsent(), false);
  await assert.rejects(fixture({ data: null }).api.hasCurrentLegalConsent());
  await assert.rejects(fixture({ error: new Error('denied') }).api.acceptCurrentLegalDocuments({access_token:'test-token-A',user:{id:'A'}}));
});

test('시행 준비가 안 된 버전을 요청하지 않는다', async () => {
  const { api, calls } = fixture(undefined, false);
  assert.throws(api.currentLegalVersion);
  await assert.rejects(api.hasCurrentLegalConsent());
  assert.equal(calls.length, 0);
});

test('SDK가 토큰을 늦게 읽는 동안 계정이 바뀌어도 수락 요청은 처음 계정의 JWT를 사용한다', async () => {
  let currentToken = 'test-token-A';
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => { resume = resolve; });
  let sentAuthorization = '';
  const api = loadModule<{acceptCurrentLegalDocuments: (session: {access_token:string;user:{id:string}}) => Promise<void>}>(
    'lib/legalConsent.ts', {
      '@/constants/legal': { LEGAL_RELAUNCH_READY: true, LEGAL_PUBLICATION: { consentVersion: '2026-10-11' } },
      '@/lib/supabase': { supabase: { rpc() {
        const headers: Record<string,string> = {};
        return {
          setHeader(name:string,value:string) { headers[name]=value; return this; },
          async abortSignal() {
            await pending;
            // 설치된 SDK처럼 명시적 Authorization이 있으면 나중의 세션 토큰을 쓰지 않는다.
            sentAuthorization = headers.Authorization ?? `Bearer ${currentToken}`;
            return {data:true,error:null};
          },
        };
      } } },
    }, {AbortController},
  );
  const accepting = api.acceptCurrentLegalDocuments({access_token:currentToken,user:{id:'A'}});
  currentToken = 'test-token-B';
  resume();
  await accepting;
  assert.equal(sentAuthorization,'Bearer test-token-A');
});

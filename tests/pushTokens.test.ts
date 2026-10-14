import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { loadModule } from './helpers/loadModule';
import * as restoreErrors from '../lib/authRestoreError';

type NativeToken = { type: 'ios'; data: string };
type Row = { token: string; user_id: string; platform: string; updated_at?: string };
const tokenA = 'ExponentPushToken[test-device-a]';
const tokenB = 'ExponentPushToken[test-device-b]';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  let actor: string | null = 'account-a';
  let permission = { status: 'granted', granted: true, canAskAgain: true, ios: { status: 2 } };
  let cache: string | null = tokenA;
  let expoToken = tokenA;
  let cacheRemoveError = false;
  let sessionError: unknown = null;
  let projectId: string | undefined = 'test-project';
  let now = 1_000_000;
  let timerId = 0;
  let pendingUpsert: Promise<unknown> | null = null;
  let pendingExpo: Promise<{ data: string }> | null = null;
  let pendingDelete: Promise<unknown> | null = null;
  let pendingCacheWrite: Promise<unknown> | null = null;
  let pendingCacheRemove: Promise<unknown> | null = null;
  let cacheWriteError = false;
  const timers = new Map<number, { at: number; run: () => void }>();
  const rows = new Map<string, Row>([[tokenA, { token: tokenA, user_id: 'account-a', platform: 'ios' }]]);
  const upserts: Row[] = [];
  const deletes: Record<string, string>[] = [];
  const expoOptions: Record<string, any>[] = [];
  const reports: unknown[] = [];
  const upsertErrors: unknown[] = [];
  const deleteErrors: unknown[] = [];
  const appListeners = new Set<(state: string) => void>();
  const tokenListeners = new Set<(token: NativeToken) => void>();
  let prompts = 0;
  let sessionReads = 0;
  const sessionErrors = new Map<number, unknown>();
  let emitNativeOnExpoRead = false;
  const appState = {
    currentState: 'active',
    addEventListener(_name: string, listener: (state: string) => void) {
      appListeners.add(listener); return { remove: () => appListeners.delete(listener) };
    },
  };
  const supabase = {
    auth: { getSession: async () => {
      sessionReads++;
      return { data: { session: actor ? { user: { id: actor } } : null }, error: sessionErrors.get(sessionReads) ?? sessionError };
    } },
    from: (name: string) => {
      assert.equal(name, 'push_tokens');
      function query(kind: 'upsert' | 'delete', row?: Row) {
        const filters: Record<string, string> = {};
        let signal: AbortSignal;
        return {
          eq(key: string, value: string) { filters[key] = value; return this; },
          abortSignal(value: AbortSignal) { signal = value; return this; },
          then(resolve: (value: { error: unknown }) => void, reject: (e: unknown) => void) {
            return (async () => {
              if (kind === 'upsert') {
                upserts.push({ ...row! });
                if (pendingUpsert) await pendingUpsert;
                const error = upsertErrors.shift();
                if (error) return { error };
                if (signal.aborted) return { error: new Error('aborted') };
                const old = rows.get(row!.token);
                if (row!.user_id !== actor || (old && old.user_id !== actor)) return { error: { code: '42501', message: 'TEST_ONLY_PRIVATE_TOKEN' } };
                rows.set(row!.token, { ...row! });
              } else {
                deletes.push({ ...filters });
                if (pendingDelete) await pendingDelete;
                const error = deleteErrors.shift();
                if (error) return { error };
                if (signal.aborted) return { error: new Error('aborted') };
                const old = rows.get(filters.token);
                if (old?.user_id === filters.user_id && old.user_id === actor) rows.delete(filters.token);
              }
              return { error: null };
            })().then(resolve, reject);
          },
        };
      }
      return { upsert: (row: Row) => query('upsert', row), delete: () => query('delete') };
    },
  };
  const constants = { get expoConfig() { return { extra: { eas: { projectId } } }; } };
  const api = loadModule<typeof import('../lib/pushTokens')>('lib/pushTokens.ts', {
    'expo-notifications': {
      IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
      getPermissionsAsync: async () => permission,
      requestPermissionsAsync: async () => { prompts++; return permission; },
      getExpoPushTokenAsync: async (options: Record<string, any>) => {
        expoOptions.push(options);
        if (emitNativeOnExpoRead && !options.devicePushToken) {
          for (const listener of tokenListeners) listener({ type: 'ios', data: 'native-a' });
        }
        return pendingExpo ?? { data: expoToken };
      },
      addPushTokenListener(listener: (token: NativeToken) => void) {
        tokenListeners.add(listener); return { remove: () => tokenListeners.delete(listener) };
      },
    },
    '@react-native-async-storage/async-storage': {
      getItem: async () => cache,
      setItem: async (_key: string, value: string) => {
        if (pendingCacheWrite) await pendingCacheWrite;
        if (cacheWriteError) throw new Error('test cache failure'); cache = value;
      },
      removeItem: async () => {
        if (pendingCacheRemove) await pendingCacheRemove;
        if (cacheRemoveError) throw new Error('test cache failure'); cache = null;
      },
    },
    'expo-constants': constants,
    'react-native': { Platform: { OS: 'ios' }, AppState: appState },
    '@sentry/react-native': {
      withScope(work: (scope: unknown) => void) {
        const tags: Record<string, string> = {};
        work({ setTag: (name: string, value: string) => { tags[name] = value; } });
        reports.push(tags);
      },
      captureMessage: (message: string, level: string) => reports.push({ message, level }),
    },
    '@/lib/supabase': { supabase },
  }, {
    AbortController,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (run: () => void, ms: number) => { const id = ++timerId; timers.set(id, { run, at: now + ms }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  return {
    api, rows, upserts, deletes, expoOptions, reports, upsertErrors, deleteErrors,
    actor: (value: string | null) => { actor = value; },
    permission: (status: string, ios = 0, canAskAgain = true) => { permission = { status, granted: status === 'granted', canAskAgain, ios: { status: ios } }; },
    sessionError: (error: unknown) => { sessionError = error; },
    sessionErrorOnRead: (read: number, error: unknown) => { sessionErrors.set(read, error); },
    project: (value: string | undefined) => { projectId = value; },
    cache: () => cache,
    clearCache: () => { cache = null; },
    failCacheRemove: () => { cacheRemoveError = true; },
    failCacheWrite: () => { cacheWriteError = true; },
    token: (value: string) => { expoToken = value; },
    holdExpo: (value: Promise<{ data: string }> | null) => { pendingExpo = value; },
    holdUpsert: (value: Promise<unknown> | null) => { pendingUpsert = value; },
    holdDelete: (value: Promise<unknown> | null) => { pendingDelete = value; },
    holdCacheWrite: (value: Promise<unknown> | null) => { pendingCacheWrite = value; },
    holdCacheRemove: (value: Promise<unknown> | null) => { pendingCacheRemove = value; },
    nativeOnRead: () => { emitNativeOnExpoRead = true; },
    prompts: () => prompts,
    sessionReads: () => sessionReads,
    listeners: () => [appListeners.size, tokenListeners.size],
    app: (state: string) => { appState.currentState = state; for (const listener of appListeners) listener(state); },
    native: (data: string) => { for (const listener of tokenListeners) listener({ type: 'ios', data }); },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, job] = next; timers.delete(id); now = job.at; job.run(); await flush();
      }
      now = target; await flush();
    },
  };
}

test('권한이 허용됐어도 비로그인에서는 등록하지 않고 로그인 뒤 새 동기화에서 등록한다', async () => {
  const f = fixture(); f.actor(null);
  assert.equal(await f.api.registerPushToken(false), 'signed-out');
  assert.equal(f.upserts.length, 0);
  f.actor('account-a'); const stop = f.api.startPushTokenSync('account-a'); await flush();
  assert.equal(f.upserts.length, 1); assert.equal(f.prompts(), 0); stop();
});

test('동시에 들어온 같은 등록은 합치고 서버 저장 뒤에만 캐시를 갱신한다', async () => {
  const f = fixture(); f.clearCache();
  const first = f.api.registerPushToken(false); const second = f.api.registerPushToken(false);
  assert.equal(first, second); assert.equal(await first, 'registered');
  assert.equal(f.upserts.length, 1); assert.equal(f.cache(), tokenA);
});

test('앱 복귀와 시스템 설정 허용 후에는 권한 창 없이 토큰을 복구한다', async () => {
  const f = fixture(); f.permission('denied', 1, false);
  const stop = f.api.startPushTokenSync('account-a'); await flush();
  assert.equal(f.upserts.length, 0); assert.equal(f.rows.has(tokenA), false);
  f.app('background'); f.permission('granted', 2); f.app('active'); await flush();
  assert.equal(f.upserts.length, 1); assert.equal(f.prompts(), 0); stop();
});

test('provisional과 ephemeral 권한도 재요청 없이 등록한다', async () => {
  for (const status of [3, 4]) {
    const f = fixture(); f.permission('undetermined', status);
    assert.equal(await f.api.registerPushToken(true), 'registered');
    assert.equal(f.prompts(), 0); assert.equal(f.upserts.length, 1);
  }
});

test('명시적인 요청에서만 권한을 묻고 거절·재요청 불가에는 재시도하지 않는다', async () => {
  const silent = fixture(); silent.permission('undetermined');
  assert.equal(await silent.api.registerPushToken(false), 'denied'); assert.equal(silent.prompts(), 0);
  const explicit = fixture(); explicit.permission('undetermined');
  assert.equal(await explicit.api.registerPushToken(true), 'denied'); assert.equal(explicit.prompts(), 1);
  const refused = fixture(); refused.permission('denied', 1, false);
  assert.equal(await refused.api.registerPushToken(true), 'denied'); assert.equal(refused.prompts(), 0);
});

test('일시 DB 오류는 두 번까지만 재시도하며 복구되면 오류 보고를 남기지 않는다', async () => {
  const f = fixture(); f.upsertErrors.push(new Error('offline'));
  const result = f.api.registerPushToken(false); await flush(); assert.equal(f.upserts.length, 1);
  await f.advance(1500); assert.equal(await result, 'registered');
  assert.equal(f.upserts.length, 2); assert.equal(f.reports.length, 0);
});

test('재시도 소진은 민감한 원문 없이 보고하며 같은 오류는 5분 동안 합친다', async () => {
  const f = fixture(); f.upsertErrors.push(...Array.from({ length: 6 }, () => ({ code: '08006', message: `PRIVATE:${tokenA}:test@example.invalid` })));
  const first = f.api.registerPushToken(false); await flush(); await f.advance(6500);
  assert.equal(await first, 'failed'); assert.equal(f.upserts.length, 3);
  const second = f.api.registerPushToken(false); await flush(); await f.advance(6500);
  assert.equal(await second, 'failed'); assert.equal(f.upserts.length, 6);
  assert.equal(f.reports.length, 2);
  assert.ok(!JSON.stringify(f.reports).includes(tokenA)); assert.ok(!JSON.stringify(f.reports).includes('PRIVATE'));
});

test('인증 조회 오류도 정상 비로그인으로 삼키지 않고 제한 재시도·보고한다', async () => {
  const f = fixture(); f.sessionError(new Error('offline'));
  const result = f.api.registerPushToken(false); await flush(); await f.advance(6500);
  assert.equal(await result, 'failed'); assert.equal(f.sessionReads(), 3); assert.equal(f.upserts.length, 0);
  assert.ok(JSON.stringify(f.reports).includes('session'));
});

test('이전 계정 소유 토큰은 RLS를 우회하거나 타인의 행을 지우지 않고 오류를 구분한다', async () => {
  const f = fixture(); f.actor('account-b');
  assert.equal(await f.api.registerPushToken(false), 'failed');
  assert.equal(f.upserts.length, 1); assert.equal(f.deletes.length, 0); assert.equal(f.rows.get(tokenA)?.user_id, 'account-a');
  assert.ok(JSON.stringify(f.reports).includes('42501'));
});

test('네이티브 토큰 변경은 전달받은 기기 토큰을 사용하고 현재 기기의 옛 토큰만 정리한다', async () => {
  const f = fixture(); f.rows.set('other-device', { token: 'other-device', user_id: 'account-a', platform: 'ios' });
  const stop = f.api.startPushTokenSync('account-a'); await flush();
  f.token(tokenB); f.native('native-b'); await flush();
  assert.equal(f.expoOptions.at(-1)?.devicePushToken.data, 'native-b');
  assert.equal(f.rows.has(tokenA), false); assert.equal(f.rows.has('other-device'), true); assert.equal(f.cache(), tokenB);
  const reads = f.expoOptions.length; f.native('native-b'); await flush(); assert.equal(f.expoOptions.length, reads); stop();
});

test('초기 native 이벤트가 와도 리스너 안에서 네이티브 조회를 재귀 호출하지 않는다', async () => {
  const f = fixture(); f.nativeOnRead(); const stop = f.api.startPushTokenSync('account-a'); await flush();
  assert.equal(f.expoOptions.length, 2); assert.equal(f.expoOptions[1].devicePushToken.data, 'native-a');
  assert.equal(f.upserts.length, 1); stop();
});

test('토큰 발급 중 계정이 바뀌면 늦은 계정의 캐시·서버 저장을 취소한다', async () => {
  const f = fixture(); const native = deferred<{ data: string }>(); f.holdExpo(native.promise);
  const old = f.api.registerPushToken(false); await flush();
  f.actor('account-b'); native.resolve({ data: tokenA });
  assert.equal(await old, 'cancelled'); assert.equal(f.upserts.length, 0);
});

test('사용자별 동기화 해제는 리스너와 재시도를 모두 취소한다', async () => {
  const f = fixture(); f.upsertErrors.push(new Error('offline'));
  const stop = f.api.startPushTokenSync('account-a'); await flush(); assert.deepEqual(f.listeners(), [1, 1]);
  stop(); assert.deepEqual(f.listeners(), [0, 0]); await f.advance(20000);
  f.app('active'); f.native('native-c'); await flush(); assert.equal(f.upserts.length, 1);
});

test('로그아웃은 진행 중 등록의 완료를 기다리고 현재 기기만 해제한다', async () => {
  const f = fixture(); const write = deferred<unknown>(); f.holdUpsert(write.promise);
  const registering = f.api.registerPushToken(false); await flush();
  let signedOut = false;
  const loggingOut = f.api.signOutWithPushTokenCleanup(async () => { signedOut = true; f.actor(null); });
  await flush(); assert.equal(signedOut, false);
  write.resolve(null); await registering; await loggingOut;
  assert.equal(signedOut, true); assert.equal(f.rows.has(tokenA), false); assert.equal(f.cache(), null);
});

test('로그아웃 실패 시 로그인 유지뿐 아니라 실제 토큰·캐시도 복구한다', async () => {
  const f = fixture(); const error = new Error('signout failed');
  await assert.rejects(f.api.signOutWithPushTokenCleanup(async () => { throw error; }), error);
  assert.equal(f.rows.get(tokenA)?.user_id, 'account-a'); assert.equal(f.cache(), tokenA); assert.equal(f.upserts.length, 1);
});

test('동시 로그아웃은 한 번만 실행하며 종료 중 등록은 재개하지 않는다', async () => {
  const f = fixture(); const signout = deferred<void>(); let calls = 0;
  const first = f.api.signOutWithPushTokenCleanup(async () => { calls++; await signout.promise; f.actor(null); });
  const second = f.api.signOutWithPushTokenCleanup(async () => { calls++; });
  assert.equal(first, second); assert.equal(await f.api.registerPushToken(false), 'cancelled');
  await flush(); signout.resolve(); await first; assert.equal(calls, 1);
});

test('토큰 해제 실패는 로그아웃 성공으로 표시하지 않고 기존 계정을 보존한다', async () => {
  const f = fixture(); f.deleteErrors.push({ code: '42501' }); let signedOut = false;
  await assert.rejects(f.api.signOutWithPushTokenCleanup(async () => { signedOut = true; }), /알림 연결/);
  assert.equal(signedOut, false); assert.equal(f.rows.get(tokenA)?.user_id, 'account-a');
});

test('삭제 후 캐시 제거 실패도 토큰을 잃지 않도록 같은 계정 등록을 복구한다', async () => {
  const f = fixture(); f.failCacheRemove();
  await assert.rejects(f.api.signOutWithPushTokenCleanup(async () => {}), /알림 연결/);
  assert.equal(f.rows.get(tokenA)?.user_id, 'account-a');
});

test('새 계정은 이전 계정의 정상 해제가 완료된 다음 같은 기기 토큰을 등록한다', async () => {
  const f = fixture(); await f.api.signOutWithPushTokenCleanup(async () => { f.actor(null); });
  f.actor('account-b'); assert.equal(await f.api.registerPushToken(false), 'registered');
  assert.equal(f.rows.get(tokenA)?.user_id, 'account-b');
});

test('프로젝트 설정 누락은 반복 요청하지 않고 관측 가능한 실패로 남긴다', async () => {
  const f = fixture(); f.project(undefined);
  assert.equal(await f.api.registerPushToken(false), 'failed'); assert.equal(f.expoOptions.length, 0);
  assert.ok(f.reports.length > 0);
});

test('실제 Auth store에서도 로그아웃 실패 시 복구된 토큰과 로그인 상태를 함께 보존한다', async () => {
  const f = fixture(); const user = { id: 'account-a', user_metadata: {}, app_metadata: {} };
  type State = { status: string; user: typeof user; session: { user: typeof user }; signOut: () => Promise<void> };
  const { useAuthStore: store } = loadModule<{ useAuthStore: StoreApi<State> }>('stores/useAuthStore.ts', {
    zustand: { create: createStore }, '@sentry/react-native': { setUser() {} },
    '@/lib/supabase': { supabase: { auth: { signOut: async () => ({ error: new Error('offline') }) } } },
    '@/lib/authStorage': {}, '@/lib/authRestoreError': restoreErrors, '@/lib/queryClient': {}, '@/lib/analytics': {},
    '@/lib/pushTokens': f.api, '@/lib/legalConsent': {},
  });
  store.setState({ status: 'signed_in', user, session: { user } });
  await assert.rejects(store.getState().signOut(), /offline/);
  assert.equal(store.getState().status, 'signed_in'); assert.equal(f.rows.get(tokenA)?.user_id, 'account-a');
});

test('루트의 자동 등록은 초기화 병렬 실행이 아니라 인증 완료 상태를 감시한다', () => {
  const source = readFileSync(new URL('../components/ActiveRootLayout.tsx', import.meta.url), 'utf8');
  assert.match(source, /authStatus !== 'signed_in' \|\| !actor/);
  assert.match(source, /return startPushTokenSync\(actor\);\s*}, \[authStatus, actor\]/);
  assert.ok(!source.includes('registerPushToken(false)'));
});

test('토큰 해제·캐시 제거 중 계정이 바뀌어도 새 계정은 로그아웃하지 않는다', async () => {
  for (const stage of ['delete', 'cache'] as const) {
    const f = fixture(); const cleanup = deferred<unknown>(); let signedOut = false;
    if (stage === 'delete') f.holdDelete(cleanup.promise); else f.holdCacheRemove(cleanup.promise);
    const result = f.api.signOutWithPushTokenCleanup(async () => { signedOut = true; }, 'account-a');
    const rejected = assert.rejects(result, /로그인 계정이 변경/);
    await flush(); f.actor('account-b'); cleanup.resolve(null); await rejected;
    assert.equal(signedOut, false);
  }
});

test('서버 등록 뒤 캐시 쓰기가 늦어도 로그아웃은 캐시 완료를 기다려 토큰을 해제한다', async () => {
  const f = fixture(); const cache = deferred<unknown>(); f.holdCacheWrite(cache.promise);
  const registering = f.api.registerPushToken(false); await flush();
  let signedOut = false;
  const result = f.api.signOutWithPushTokenCleanup(async () => { signedOut = true; f.actor(null); });
  await flush(); assert.equal(signedOut, false);
  cache.resolve(null); await registering; await result;
  assert.equal(f.rows.has(tokenA), false); assert.equal(f.cache(), null);
});

test('캐시 저장에 실패한 새 토큰도 로그아웃에서 빠뜨리지 않고 해제한다', async () => {
  const f = fixture(); f.token(tokenB); f.failCacheWrite();
  const registering = f.api.registerPushToken(false); await flush();
  assert.equal(f.rows.has(tokenB), true); assert.equal(f.cache(), tokenA);
  await f.api.signOutWithPushTokenCleanup(async () => { f.actor(null); });
  await registering; assert.equal(f.rows.has(tokenB), false); assert.equal(f.rows.has(tokenA), false);
});

test('로그아웃 도중 시작된 동기화도 실패 후 살아 있는 계정의 등록을 재개한다', async () => {
  const f = fixture(); const signout = deferred<void>();
  const loggingOut = f.api.signOutWithPushTokenCleanup(async () => { await signout.promise; throw new Error('offline'); });
  const rejected = assert.rejects(loggingOut, /offline/); await flush();
  const stop = f.api.startPushTokenSync('account-a'); signout.resolve(); await rejected; await flush();
  assert.equal(f.rows.get(tokenA)?.user_id, 'account-a'); stop();
});

test('옛 동기화의 늦은 정리가 새 계정의 동기화를 취소하지 않는다', async () => {
  const f = fixture(); const stopOld = f.api.startPushTokenSync('account-a'); await flush();
  f.rows.delete(tokenA); f.actor('account-b'); const stopNew = f.api.startPushTokenSync('account-b');
  stopOld(); await flush(); assert.equal(f.rows.get(tokenA)?.user_id, 'account-b'); stopNew();
});

test('포그라운드 복귀는 대기 중인 옛 권한 조회보다 새 설정을 우선한다', async () => {
  const f = fixture(); const native = deferred<{ data: string }>(); f.holdExpo(native.promise);
  const stop = f.api.startPushTokenSync('account-a'); await flush();
  f.app('background'); f.permission('denied', 1, false); f.app('active'); await flush();
  native.resolve({ data: tokenA }); await flush();
  assert.equal(f.upserts.length, 0); assert.equal(f.rows.has(tokenA), false); stop();
});

test('토큰 해제 뒤 최종 계정 재조회만 실패해도 로그인과 토큰을 함께 복구한다', async () => {
  const f = fixture(); f.sessionErrorOnRead(3, new Error('session temporarily unavailable'));
  let signedOut = false;
  await assert.rejects(f.api.signOutWithPushTokenCleanup(async () => { signedOut = true; }), /temporarily unavailable/);
  assert.equal(signedOut, false); assert.equal(f.rows.get(tokenA)?.user_id, 'account-a'); assert.equal(f.cache(), tokenA);
});

test('토큰 발급이 시간 초과되면 늦은 응답은 저장하지 않고 제한 횟수만 시도한다', async () => {
  const f = fixture(); const native = deferred<{ data: string }>(); f.holdExpo(native.promise);
  const result = f.api.registerPushToken(false); await flush();
  await f.advance(42500); assert.equal(await result, 'failed');
  assert.equal(f.expoOptions.length, 3); assert.equal(f.upserts.length, 0);
  native.resolve({ data: tokenA }); await flush(); assert.equal(f.upserts.length, 0);
});

test('백그라운드에서는 자동 등록을 시작하지 않고 복귀 후 등록한다', async () => {
  const f = fixture(); f.app('background'); const stop = f.api.startPushTokenSync('account-a');
  await flush(); assert.equal(f.upserts.length, 0);
  f.app('active'); await flush(); assert.equal(f.upserts.length, 1); stop();
});

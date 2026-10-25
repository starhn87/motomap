import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Session, User } from '@supabase/supabase-js';

import * as restoreErrors from '../lib/authRestoreError';
import { loadModule } from './helpers/loadModule';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const session = {
  access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
  user: {
    id: 'test-user', app_metadata: {}, aud: 'authenticated', created_at: '2026-10-01',
    user_metadata: { name: '제공자 이름', avatar_url: 'provider-photo' },
  },
} satisfies Session;
const profile = {
  onboarding_completed_at: '2026-10-01', nickname: '모토맵 닉네임', avatar_url: 'saved-photo',
};
type ProfileResult = { data: typeof profile | null; error: unknown };
type State = {
  user: User | null; session: Session | null; status: string; restoreError: string | null;
  initialize: () => Promise<void>; signOut: () => Promise<void>;
  syncProfileNickname: (nickname: string) => void;
};

function fixture(options: {
  fetchProfile?: () => Promise<ProfileResult>;
  getSession?: () => Promise<{ data: { session: Session | null }; error: unknown }>;
  migrate?: () => Promise<void>;
  signOutError?: Error;
  fetchConsent?: () => Promise<boolean>;
} = {}) {
  let authEvent!: (event: string, session: Session | null) => void;
  let cleared = 0;
  const errors: unknown[] = [];
  const { useAuthStore: store } = loadModule<{ useAuthStore: StoreApi<State> }>(
    'stores/useAuthStore.ts',
    {
      zustand: { create: createStore },
      '@sentry/react-native': {
        setUser() {}, addBreadcrumb() {}, captureException(error: unknown) { errors.push(error); },
        withScope(callback: (scope: unknown) => void) {
          callback({ setTag() {}, setContext() {} });
        },
      },
      '@/lib/supabase': {
        supabase: {
          auth: {
            getSession: options.getSession ?? (async () => ({ data: { session }, error: null })),
            signOut: async () => ({ error: options.signOutError ?? null }),
            onAuthStateChange(callback: typeof authEvent) {
              authEvent = callback;
              return { data: { subscription: { unsubscribe() {} } } };
            },
          },
          from: () => ({ select: () => ({ eq: () => ({
            maybeSingle: options.fetchProfile ?? (async () => ({ data: profile, error: null })),
          }) }) }),
        },
      },
      '@/lib/authStorage': { confirmAuthStorageMigration: options.migrate ?? (async () => {}) },
      '@/lib/authRestoreError': restoreErrors,
      '@/lib/queryClient': { queryClient: { clear() { cleared++; } } },
      '@/lib/analytics': { identifyUser() {}, resetUser() {} },
      '@/lib/pushTokens': { signOutWithPushTokenCleanup: async (work: () => Promise<void>) => work() },
      '@/lib/legalConsent': { hasCurrentLegalConsent: options.fetchConsent ?? (async () => true) },
    },
  );
  return { store, errors, emit: (event: string, value: Session | null) => authEvent(event, value),
    cleared: () => cleared };
}

test('소셜 세션 복원·갱신에도 기존 닉네임과 사진을 보존하고 닉네임 변경을 즉시 합성한다', async () => {
  const { store, emit } = fixture();
  await store.getState().initialize();
  assert.equal(store.getState().status, 'signed_in');
  assert.equal(store.getState().user?.user_metadata.name, profile.nickname);
  assert.equal(store.getState().session?.user.user_metadata.avatar_url, profile.avatar_url);
  for (const event of ['TOKEN_REFRESHED', 'USER_UPDATED']) {
    emit(event, session);
    assert.equal(store.getState().user?.user_metadata.name, profile.nickname);
    assert.equal(store.getState().user?.user_metadata.avatar_url, profile.avatar_url);
  }
  store.getState().syncProfileNickname('수정한 이름');
  assert.equal(store.getState().user?.user_metadata.name, '수정한 이름');
  assert.equal(store.getState().session?.user.user_metadata.name, '수정한 이름');
  assert.equal(session.user.user_metadata.name, '제공자 이름');
});

test('기존 계정의 새 동의가 없으면 계정 데이터는 보존하고 재동의 상태로 진입한다', async () => {
  const { store } = fixture({ fetchConsent: async () => false });
  await store.getState().initialize();
  assert.equal(store.getState().status, 'needs_consent');
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().session?.user.user_metadata.name, profile.nickname);
});

test('동의 조회 실패를 동의 완료로 바꾸거나 로그아웃하지 않는다', async () => {
  const { store } = fixture({ fetchConsent: async () => { throw new Error('offline'); } });
  await store.getState().initialize();
  assert.equal(store.getState().status, 'restoring');
  assert.ok(store.getState().restoreError);
  assert.equal(store.getState().session?.user.id, session.user.id);
});

test('늦은 동의 조회는 로그아웃 뒤 계정을 복원하지 않는다', async () => {
  const pending = deferred<boolean>();
  const { store } = fixture({ fetchConsent: () => pending.promise });
  const restoring = store.getState().initialize();
  await new Promise<void>((done) => setImmediate(done));
  await store.getState().signOut();
  pending.resolve(true);
  await restoring;
  assert.equal(store.getState().status, 'signed_out');
  assert.equal(store.getState().user, null);
});

test('프로필이 없으면 로그인 완료로 오인하지 않고 온보딩 상태로 남는다', async () => {
  const { store } = fixture({ fetchProfile: async () => ({ data: null, error: null }) });
  await store.getState().initialize();
  assert.equal(store.getState().status, 'needs_onboarding');
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().session?.user.id, session.user.id);
});

test('실패한 로그아웃은 계정·캐시를 먼저 지우지 않는다', async () => {
  const error = new Error('network unavailable');
  const { store, cleared } = fixture({ signOutError: error });
  await store.getState().initialize();
  await assert.rejects(store.getState().signOut(), error);
  assert.equal(store.getState().status, 'signed_in');
  assert.equal(cleared(), 0);
});

test('로그아웃 뒤 늦게 끝난 프로필 조회가 이전 계정을 되살리지 않는다', async () => {
  const pending = deferred<ProfileResult>();
  const { store } = fixture({ fetchProfile: () => pending.promise });
  const restoring = store.getState().initialize();
  await new Promise<void>((done) => setImmediate(done));
  await store.getState().signOut();
  pending.resolve({ data: profile, error: null });
  await restoring;
  assert.equal(store.getState().status, 'signed_out');
  assert.equal(store.getState().user, null);
});

test('보안 저장소 정리 중 로그아웃해도 이전 세션이 다시 반영되지 않는다', async () => {
  const pending = deferred<void>();
  const { store } = fixture({ migrate: () => pending.promise });
  const restoring = store.getState().initialize();
  await new Promise<void>((done) => setImmediate(done));
  await store.getState().signOut();
  pending.resolve();
  await restoring;
  assert.equal(store.getState().status, 'signed_out');
  assert.equal(store.getState().session, null);
});

test('다른 인증 이벤트 뒤 늦은 조회 예외는 현재 상태를 실패로 덮어쓰지 않는다', async () => {
  const pending = deferred<ProfileResult>();
  const { store, emit, errors } = fixture({ fetchProfile: () => pending.promise });
  const restoring = store.getState().initialize();
  await new Promise<void>((done) => setImmediate(done));
  emit('SIGNED_OUT', null);
  pending.reject(new Error('old request failed'));
  await restoring;
  assert.equal(store.getState().status, 'signed_out');
  assert.equal(errors.length, 0);
});

test('getSession 대기 중 인증 상태가 바뀌면 오래된 조회 결과를 사용하지 않는다', async () => {
  const pending = deferred<{ data: { session: Session | null }; error: unknown }>();
  const { store, emit } = fixture({ getSession: () => pending.promise });
  const restoring = store.getState().initialize();
  emit('SIGNED_OUT', null);
  pending.resolve({ data: { session }, error: null });
  await restoring;
  assert.equal(store.getState().status, 'signed_out');
  assert.equal(store.getState().session, null);
});

test('현재 세션의 프로필 실패는 세션을 지우지 않고 재시도 상태로 표시한다', async () => {
  const { store, errors } = fixture({
    fetchProfile: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
  });
  await store.getState().initialize();
  assert.equal(store.getState().status, 'restoring');
  assert.equal(store.getState().session?.user.id, session.user.id);
  assert.equal(store.getState().restoreError, '계정 정보를 불러오지 못했습니다.');
  assert.equal(errors.length, 1);
});

test('초기 세션 알림은 진행 중인 시작 복원을 중복 조회하거나 무효화하지 않는다', async () => {
  const first = deferred<ProfileResult>();
  const duplicate = deferred<ProfileResult>();
  let queries = 0;
  const { store, emit } = fixture({
    fetchProfile: () => ++queries === 1 ? first.promise : duplicate.promise,
  });
  const restoring = store.getState().initialize();
  await new Promise<void>((done) => setImmediate(done));
  emit('INITIAL_SESSION', session);
  first.resolve({ data: profile, error: null });
  await restoring;
  // 실제 첫 응답이 도착했는데 중복 요청을 기다리며 스플래시에 남으면 안 된다.
  const result = { queries, status: store.getState().status };
  duplicate.resolve({ data: profile, error: null });
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(result, { queries: 1, status: 'signed_in' });
});

test('초기 세션 알림이 먼저 와도 getSession의 복원 결과만 한 번 확인한다', async () => {
  const pending = deferred<{ data: { session: Session | null }; error: unknown }>();
  let queries = 0;
  const { store, emit } = fixture({
    getSession: () => pending.promise,
    fetchProfile: async () => { queries++; return { data: profile, error: null }; },
  });
  const restoring = store.getState().initialize();
  emit('INITIAL_SESSION', session);
  await new Promise<void>((done) => setImmediate(done));
  pending.resolve({ data: { session }, error: null });
  await restoring;
  assert.equal(queries, 1);
  assert.equal(store.getState().status, 'signed_in');
});

test('시작 복원 후 늦은 초기 알림이 새 조회나 restoring 전환을 만들지 않는다', async () => {
  let queries = 0;
  const { store, emit } = fixture({
    fetchProfile: async () => { queries++; return { data: profile, error: null }; },
  });
  await store.getState().initialize();
  emit('INITIAL_SESSION', session);
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(queries, 1);
  assert.equal(store.getState().status, 'signed_in');
});

test('초기 알림이 세션을 줘도 getSession 실패를 로그인 성공으로 우회하지 않는다', async () => {
  const pending = deferred<{ data: { session: Session | null }; error: unknown }>();
  let queries = 0;
  const { store, emit, errors } = fixture({
    getSession: () => pending.promise,
    fetchProfile: async () => { queries++; return { data: profile, error: null }; },
  });
  const restoring = store.getState().initialize();
  emit('INITIAL_SESSION', session);
  pending.resolve({ data: { session: null }, error: new Error('keychain unavailable') });
  await restoring;
  assert.equal(queries, 0);
  assert.equal(store.getState().status, 'restoring');
  assert.ok(store.getState().restoreError);
  assert.equal(errors.length, 1);
});

test('getSession 대기 중 새 로그인은 초기 알림과 달리 정상적으로 반영한다', async () => {
  const pending = deferred<{ data: { session: Session | null }; error: unknown }>();
  const { store, emit } = fixture({ getSession: () => pending.promise });
  const restoring = store.getState().initialize();
  emit('SIGNED_IN', session);
  await new Promise<void>((done) => setImmediate(done));
  pending.resolve({ data: { session: null }, error: null });
  await restoring;
  assert.equal(store.getState().status, 'signed_in');
  assert.equal(store.getState().user?.id, session.user.id);
});

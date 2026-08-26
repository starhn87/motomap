import { create } from 'zustand';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import { confirmAuthStorageMigration } from '@/lib/authStorage';
import { queryClient } from '@/lib/queryClient';
import { identifyUser, resetUser } from '@/lib/analytics';
import { unregisterPushToken } from '@/lib/push';
import type { User, Session } from '@supabase/supabase-js';

export type AuthStatus =
  | 'restoring'
  | 'signed_out'
  | 'needs_onboarding'
  | 'signed_in';

interface AuthStore {
  user: User | null;
  session: Session | null;
  status: AuthStatus;
  restoreError: string | null;
  initialize: () => Promise<void>;
  refreshOnboardingStatus: () => Promise<void>;
  signOut: (scope?: 'global' | 'local') => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;
let sessionRevision = 0;

type AuthRestoreStage = 'initialize' | 'session' | 'profile' | 'auth_state_change';

/**
 * Supabase의 PostgREST 오류는 Error가 아닌 { code, details, hint, message }
 * 객체다. 그대로 captureException 하면 Sentry 제목이 "Object captured..."로
 * 뭉개지므로 Error로 정규화하고 진단 필드는 별도 컨텍스트에 보존한다.
 */
function captureAuthRestoreError(error: unknown, stage: AuthRestoreStage) {
  const structured =
    error && typeof error === 'object'
      ? error as Record<string, unknown>
      : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof structured?.message === 'string'
        ? structured.message
        : String(error);
  const normalized = error instanceof Error ? error : new Error(message);
  const code = typeof structured?.code === 'string' ? structured.code : null;

  if (!(error instanceof Error)) {
    normalized.name = code ? `AuthRestoreError(${code})` : 'AuthRestoreError';
  }

  Sentry.withScope((scope) => {
    scope.setTag('area', 'auth_restore');
    scope.setTag('auth_restore_stage', stage);
    if (code) scope.setTag('error_code', code);
    if (structured) {
      scope.setContext('auth_restore_error', {
        code,
        details: typeof structured.details === 'string' ? structured.details : null,
        hint: typeof structured.hint === 'string' ? structured.hint : null,
      });
    }
    Sentry.captureException(normalized);
  });
}

function setAuthRestoreFailure(
  set: (partial: Partial<AuthStore>) => void,
  error: unknown,
  stage: AuthRestoreStage,
) {
  captureAuthRestoreError(error, stage);
  set({
    status: 'restoring',
    restoreError: '계정 정보를 불러오지 못했습니다.',
  });
}

function syncSentryUser(user: User | null) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * 소셜 identity를 연결하면 Supabase Auth의 avatar_url이 새 제공자 사진으로
 * 바뀔 수 있다. 사용자가 모토맵에 저장한 프로필 사진이 있으면 그것을 정본으로
 * 유지하고, 저장된 사진이 없을 때만 Auth 제공자 사진을 그대로 쓴다.
 */
function withProfileAvatar(user: User, profileAvatar: unknown): User {
  const avatarUrl = typeof profileAvatar === 'string' ? profileAvatar.trim() : '';
  if (!avatarUrl || user.user_metadata?.avatar_url === avatarUrl) return user;
  return {
    ...user,
    user_metadata: {
      ...user.user_metadata,
      avatar_url: avatarUrl,
    },
  };
}

async function resolveSession(
  session: Session | null,
  set: (partial: Partial<AuthStore>) => void,
) {
  const revision = ++sessionRevision;

  if (!session) {
    syncSentryUser(null);
    resetUser();
    set({
      session: null,
      user: null,
      status: 'signed_out',
      restoreError: null,
    });
    return;
  }

  syncSentryUser(session.user);
  set({
    session,
    user: null,
    status: 'restoring',
    restoreError: null,
  });

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle();

  if (revision !== sessionRevision) return;

  if (error) {
    captureAuthRestoreError(error, 'profile');
    set({
      session,
      user: null,
      status: 'restoring',
      restoreError: '계정 정보를 불러오지 못했습니다.',
    });
    return;
  }

  await confirmAuthStorageMigration();

  const complete = Boolean(data?.onboarding_completed_at);
  const resolvedUser = withProfileAvatar(session.user, data?.avatar_url);
  const resolvedSession = resolvedUser === session.user
    ? session
    : { ...session, user: resolvedUser };
  if (complete) identifyUser(resolvedUser.id);
  set({
    session: resolvedSession,
    user: complete ? resolvedUser : null,
    status: complete ? 'signed_in' : 'needs_onboarding',
    restoreError: null,
  });
}

async function restoreCurrentSession(set: (partial: Partial<AuthStore>) => void) {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    await resolveSession(session, set);
  } catch (error) {
    setAuthRestoreFailure(set, error, 'session');
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  status: 'restoring',
  restoreError: null,
  initialize: async () => {
    try {
      authSubscription?.unsubscribe();
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        const current = get();
        if (
          event === 'TOKEN_REFRESHED' &&
          session &&
          current.status === 'signed_in' &&
          current.user?.id === session.user.id
        ) {
          // 토큰 갱신이 소셜 제공자 메타데이터를 다시 보내더라도 현재 세션에
          // 반영해 둔 모토맵 프로필 사진을 덮어쓰지 않는다.
          const refreshedUser = withProfileAvatar(
            session.user,
            current.user.user_metadata?.avatar_url,
          );
          syncSentryUser(refreshedUser);
          set({
            session: refreshedUser === session.user
              ? session
              : { ...session, user: refreshedUser },
            user: refreshedUser,
          });
          return;
        }
        void resolveSession(session, set).catch((error) => {
          setAuthRestoreFailure(set, error, 'auth_state_change');
        });
      });
      authSubscription = data.subscription;

      await restoreCurrentSession(set);
    } catch (error) {
      setAuthRestoreFailure(set, error, 'initialize');
    }
  },
  refreshOnboardingStatus: async () => {
    await restoreCurrentSession(set);
  },
  signOut: async (scope = 'global') => {
    await unregisterPushToken();
    await supabase.auth.signOut({ scope });
    // 계정 전환 시 이전 사용자의 캐시(즐겨찾기·주행·리뷰 등)가 노출되지 않도록 비움
    queryClient.clear();
    syncSentryUser(null);
    resetUser();
    set({
      user: null,
      session: null,
      status: 'signed_out',
      restoreError: null,
    });
  },
}));

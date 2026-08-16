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
  signOut: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;
let sessionRevision = 0;

function syncSentryUser(user: User | null) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
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
    .select('onboarding_completed_at')
    .eq('id', session.user.id)
    .maybeSingle();

  if (revision !== sessionRevision) return;

  if (error) {
    Sentry.captureException(error, { tags: { area: 'auth_restore' } });
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
  if (complete) identifyUser(session.user.id);
  set({
    session,
    user: complete ? session.user : null,
    status: complete ? 'signed_in' : 'needs_onboarding',
    restoreError: null,
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  status: 'restoring',
  restoreError: null,
  initialize: async () => {
    authSubscription?.unsubscribe();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const current = get();
      if (
        event === 'TOKEN_REFRESHED' &&
        session &&
        current.status === 'signed_in' &&
        current.user?.id === session.user.id
      ) {
        syncSentryUser(session.user);
        set({ session, user: session.user });
        return;
      }
      void resolveSession(session, set);
    });
    authSubscription = data.subscription;

    const { data: { session } } = await supabase.auth.getSession();
    await resolveSession(session, set);
  },
  refreshOnboardingStatus: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await resolveSession(session, set);
  },
  signOut: async () => {
    await unregisterPushToken();
    await supabase.auth.signOut();
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

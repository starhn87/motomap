import { create } from 'zustand';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

function syncSentryUser(user: User | null) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    syncSentryUser(user);
    set({
      session,
      user,
      loading: false,
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      syncSentryUser(user);
      set({
        session,
        user,
      });
    });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    syncSentryUser(null);
    set({ user: null, session: null });
  },
}));

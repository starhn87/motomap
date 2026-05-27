import { supabase } from '@/lib/supabase';

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string, nickname: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: nickname },
    },
  });
  if (error) throw error;
}

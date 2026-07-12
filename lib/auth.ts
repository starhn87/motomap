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

// API 래퍼 공통 — 로그인이 필수인 동작은 requireUser(없으면 throw),
// 조회처럼 비로그인도 허용하는 곳은 getCurrentUser(null 허용)를 쓴다.
export async function requireUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  return user;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

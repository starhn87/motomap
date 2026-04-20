import { supabase } from '@/lib/supabase';

const ADJECTIVES = [
  '달리는', '질주하는', '멋진', '용감한', '자유로운',
  '빠른', '거친', '쿨한', '터프한', '와일드한',
  '야생의', '불꽃', '강철', '바람의', '폭풍의',
  '번개', '천둥', '어둠의', '새벽의', '황혼의',
  '붉은', '검은', '푸른', '은빛', '황금',
];

const NOUNS = [
  '라이더', '바이커', '로드러너', '스피드스터', '드라이버',
  '나이트', '팬텀', '이글', '호크', '울프',
  '타이거', '드래곤', '피닉스', '레이서', '크루저',
  '라이딩왕', '바람돌이', '투어러', '원정대', '탐험가',
  '방랑자', '질주자', '개척자', '모험가', '여행자',
];

export function generateRandomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .single();

  return !data;
}

export async function createProfile(nickname: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('profiles').insert({
    id: user.id,
    nickname,
  });

  if (error) {
    if (error.code === '23505') {
      throw new Error('이미 사용 중인 닉네임입니다.');
    }
    throw error;
  }

  // user_metadata에도 닉네임 저장
  await supabase.auth.updateUser({
    data: { name: nickname },
  });
}

export async function getProfile(): Promise<{ nickname: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', user.id)
    .single();

  return data;
}

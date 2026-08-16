import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: '로그인이 필요합니다.' }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: '로그인이 필요합니다.' }, 401);

  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    // 완료된 계정은 이 경로로 절대 지우지 않는다. 설정의 회원 탈퇴만 사용한다.
    if (profile?.onboarding_completed_at) {
      return json({ error: '이미 사용 중인 계정은 정리할 수 없습니다.' }, 409);
    }

    const { error: cleanupError } = await admin.rpc('prepare_account_deletion', {
      p_user_id: user.id,
    });
    if (cleanupError) throw cleanupError;

    // 미완성 가입은 identity를 바로 해제해야 기존 계정의 linkIdentity가 이어진다.
    // soft delete는 identity를 보존할 수 있으므로 이 제한된 경로에서만 hard delete한다.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (error) {
    console.error('discard-onboarding-account failed', error);
    return json({ error: '미완성 계정을 정리하지 못했습니다.' }, 500);
  }
});

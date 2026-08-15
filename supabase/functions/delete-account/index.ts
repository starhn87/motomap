import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MEDIA_BUCKET = 'ridemap-media';
const MEDIA_PATH_MARKER = `/storage/v1/object/public/${MEDIA_BUCKET}/`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(MEDIA_PATH_MARKER);
    if (markerIndex < 0) return null;
    return decodeURIComponent(pathname.slice(markerIndex + MEDIA_PATH_MARKER.length));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: '로그인이 필요합니다.' }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: '로그인이 필요합니다.' }, 401);

  try {
    // Auth 삭제 전에 사용자가 올린 파일을 Storage API로 지운다. SQL로 metadata만
    // 지우면 실제 파일이 고아로 남으므로 반드시 API를 사용한다.
    const [profile, reviews, hazards] = await Promise.all([
      admin.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle(),
      admin.from('reviews').select('photos').eq('user_id', user.id),
      admin.from('road_hazards').select('photo').eq('reported_by', user.id),
    ]);
    for (const result of [profile, reviews, hazards]) {
      if (result.error) throw result.error;
    }

    const paths = new Set<string>();
    const avatarPath = mediaPath(profile.data?.avatar_url);
    if (avatarPath) paths.add(avatarPath);
    for (const review of reviews.data ?? []) {
      for (const url of review.photos ?? []) {
        const path = mediaPath(url);
        if (path) paths.add(path);
      }
    }
    for (const hazard of hazards.data ?? []) {
      const path = mediaPath(hazard.photo);
      if (path) paths.add(path);
    }

    if (paths.size > 0) {
      const { error } = await admin.storage.from(MEDIA_BUCKET).remove([...paths]);
      if (error) throw error;
    }

    // 재호출해도 같은 결과가 되는 정리 함수라 Auth 요청이 일시 실패하면 다시 시도할 수 있다.
    const { error: cleanupError } = await admin.rpc('prepare_account_deletion', {
      p_user_id: user.id,
    });
    if (cleanupError) throw cleanupError;

    // 식별 불가능한 해시만 Auth에 남기는 비가역 soft-delete. 클라이언트의 세션도
    // 응답 직후 폐기한다. Supabase JWT는 만료 전까지 유효할 수 있어 민감 테이블은
    // 위 단계에서 먼저 정리하고, 이후 API는 프로필이 없어 정상 사용되지 않는다.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (error) {
    console.error('delete-account failed', error);
    return json({ error: '계정 삭제를 완료하지 못했습니다.' }, 500);
  }
});

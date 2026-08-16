import { createClient, type User } from 'npm:@supabase/supabase-js@2.111.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CLEANUP_SECRET = Deno.env.get('ONBOARDING_CLEANUP_SECRET') ?? '';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const USERS_PER_PAGE = 1000;
const MAX_SCAN_PAGES = 20;
const MAX_DELETE_PER_RUN = 25;
const SOCIAL_PROVIDERS = new Set(['apple', 'google', 'kakao', 'custom:naver']);

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

function secretsMatch(actual: string, expected: string): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function isSocialUser(user: User): boolean {
  const providers = new Set<string>();
  const primary = user.app_metadata?.provider;
  if (typeof primary === 'string') providers.add(primary);

  const linked = user.app_metadata?.providers;
  if (Array.isArray(linked)) {
    for (const provider of linked) {
      if (typeof provider === 'string') providers.add(provider);
    }
  }
  for (const identity of user.identities ?? []) providers.add(identity.provider);

  return [...providers].some((provider) => SOCIAL_PROVIDERS.has(provider));
}

function isInactiveBefore(user: User, cutoffMs: number): boolean {
  const createdAt = Date.parse(user.created_at);
  const lastSignInAt = Date.parse(user.last_sign_in_at ?? user.created_at);
  const updatedAt = Date.parse(user.updated_at ?? user.created_at);
  return createdAt <= cutoffMs && Math.max(lastSignInAt, updatedAt) <= cutoffMs;
}

async function findCandidates(cutoffMs: number): Promise<{
  users: User[];
  scanned: number;
  scanTruncated: boolean;
}> {
  const candidates: User[] = [];
  let scanned = 0;
  let scanTruncated = false;

  for (let page = 1; page <= MAX_SCAN_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });
    if (error) throw error;

    const users = data.users;
    scanned += users.length;
    const oldSocialUsers = users.filter(
      (user) => isSocialUser(user) && isInactiveBefore(user, cutoffMs),
    );

    if (oldSocialUsers.length > 0) {
      const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id')
        .in('id', oldSocialUsers.map((user) => user.id));
      if (profileError) throw profileError;

      const profileIds = new Set((profiles ?? []).map((profile) => profile.id));
      candidates.push(...oldSocialUsers.filter((user) => !profileIds.has(user.id)));
    }

    if (users.length < USERS_PER_PAGE) break;
    if (page === MAX_SCAN_PAGES) scanTruncated = true;
  }

  return { users: candidates, scanned, scanTruncated };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!CLEANUP_SECRET) return json({ error: 'cleanup_secret_not_configured' }, 503);
  if (!secretsMatch(req.headers.get('x-cleanup-secret') ?? '', CLEANUP_SECRET)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({})) as { dryRun?: unknown };
    const dryRun = body.dryRun === true;
    const cutoffMs = Date.now() - RETENTION_MS;
    const candidates = await findCandidates(cutoffMs);

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        retentionDays: 7,
        scanned: candidates.scanned,
        eligible: candidates.users.length,
        scanTruncated: candidates.scanTruncated,
      });
    }

    let deleted = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates.users.slice(0, MAX_DELETE_PER_RUN)) {
      try {
        // 스캔 직후 다시 로그인하거나 프로필을 완성한 계정을 지우지 않도록 직전에 재확인한다.
        const { data: freshUserData, error: freshUserError } =
          await admin.auth.admin.getUserById(candidate.id);
        if (freshUserError) throw freshUserError;
        if (!freshUserData.user || !isInactiveBefore(freshUserData.user, cutoffMs)) {
          skipped += 1;
          continue;
        }

        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .select('id')
          .eq('id', candidate.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (profile) {
          skipped += 1;
          continue;
        }

        const { error: cleanupError } = await admin.rpc('prepare_account_deletion', {
          p_user_id: candidate.id,
        });
        if (cleanupError) throw cleanupError;

        // identity를 해제해 같은 소셜 계정으로 다시 가입하거나 기존 계정에 연결할 수 있게 한다.
        const { error: deleteError } = await admin.auth.admin.deleteUser(candidate.id, false);
        if (deleteError) throw deleteError;
        deleted += 1;
      } catch (error) {
        failed += 1;
        console.error('failed to clean incomplete onboarding account', candidate.id, error);
      }
    }

    const result = {
      ok: failed === 0,
      dryRun: false,
      retentionDays: 7,
      scanned: candidates.scanned,
      eligible: candidates.users.length,
      deleted,
      skipped,
      failed,
      deleteLimit: MAX_DELETE_PER_RUN,
      scanTruncated: candidates.scanTruncated,
    };
    return json(result, failed === 0 ? 200 : 500);
  } catch (error) {
    console.error('cleanup-onboarding-accounts failed', error);
    return json({ error: 'cleanup_failed' }, 500);
  }
});

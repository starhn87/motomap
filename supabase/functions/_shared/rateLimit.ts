import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT') ?? '';

const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  retry_after_seconds: number;
}

async function verifiedUserId(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  // 비로그인 supabase-js가 legacy anon JWT를 Authorization에도 싣는 경우가 있다.
  if (!token || token === SUPABASE_ANON_KEY) return null;
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

function requestAddress(req: Request): string {
  // 클라이언트가 앞에 임의 값을 붙여도 우회하기 어렵도록 게이트웨이에 가장 가까운 값을 쓴다.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function hmac(value: string): Promise<string> {
  if (!RATE_LIMIT_SALT) throw new Error('RATE_LIMIT_SALT 미설정');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(RATE_LIMIT_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requesterKey(req: Request): Promise<string> {
  const userId = await verifiedUserId(req);
  return hmac(userId ? `user:${userId}` : `ip:${requestAddress(req)}`);
}

/** 제한을 넘으면 바로 반환할 429 Response, 통과하면 null. */
export async function enforceRateLimits(
  req: Request,
  rules: RateLimitRule[],
): Promise<Response | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase Edge Function 환경변수 미설정');
  }
  const keyHash = await requesterKey(req);
  for (const rule of rules) {
    const { data, error } = await admin.rpc('consume_edge_rate_limit', {
      p_scope: rule.scope,
      p_key_hash: keyHash,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) throw error;
    const result = (data as RateLimitResult[] | null)?.[0];
    if (!result) throw new Error(`호출 제한 결과 없음: ${rule.scope}`);
    if (!result.allowed) {
      const retryAfter = Math.max(1, result.retry_after_seconds || 1);
      return Response.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        },
      );
    }
  }
  return null;
}

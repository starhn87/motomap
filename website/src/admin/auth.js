const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ADMIN_COOKIE = 'motomap_admin';

export function parseAdminAllowlist(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { valid: false, ids: new Set() };
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((item) => !UUID.test(item))) {
    return { valid: false, ids: new Set() };
  }
  return { valid: true, ids: new Set(parts.map((item) => item.toLowerCase())) };
}

export function isAllowlisted(allowlist, userId) {
  if (!allowlist?.valid || typeof userId !== 'string') return false;
  return allowlist.ids.has(userId.toLowerCase());
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeSession(tokens) {
  if (!tokens?.access || !tokens?.refresh) return null;
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    access: tokens.access,
    refresh: tokens.refresh,
  })));
}

export function decodeSession(value) {
  if (!value || value.length > 8000) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
    if (typeof parsed?.access !== 'string' || typeof parsed?.refresh !== 'string') return null;
    return { access: parsed.access, refresh: parsed.refresh };
  } catch {
    return null;
  }
}

export function readSession(request) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === ADMIN_COOKIE) return decodeSession(part.slice(separator + 1).trim());
  }
  return null;
}

export function sessionCookie(value, secure, maxAge = 60 * 60 * 24 * 7) {
  const parts = [
    `${ADMIN_COOKIE}=${value}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/admin',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie(secure) {
  return sessionCookie('', secure, 0);
}

export function isSameOriginPost(request) {
  if (request.method !== 'POST') return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function authBase(url) {
  return url.replace(/\/$/, '');
}

export async function fetchAuthUser({ url, anonKey, accessToken, fetchImpl }) {
  const response = await fetchImpl(`${authBase(url)}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { ok: false, status: response.status };
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status };
  }
  // 인가에 쓰는 값은 Auth 사용자 id뿐이다. user_metadata는 읽지 않는다.
  const id = typeof body?.id === 'string' ? body.id.toLowerCase() : '';
  return id ? { ok: true, id } : { ok: false, status: response.status };
}

export async function refreshAuthSession({ url, anonKey, refreshToken, fetchImpl }) {
  const response = await fetchImpl(`${authBase(url)}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return { ok: false };
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false };
  }
  if (typeof body?.access_token !== 'string' || typeof body?.refresh_token !== 'string') return { ok: false };
  return { ok: true, access: body.access_token, refresh: body.refresh_token };
}

export async function requestEmailCode({ url, anonKey, email, fetchImpl }) {
  const response = await fetchImpl(`${authBase(url)}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });
  return response.ok;
}

export async function verifyEmailCode({ url, anonKey, email, token, fetchImpl }) {
  const response = await fetchImpl(`${authBase(url)}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token }),
  });
  if (!response.ok) return { ok: false };
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false };
  }
  if (typeof body?.access_token !== 'string' || typeof body?.refresh_token !== 'string') return { ok: false };
  return { ok: true, access: body.access_token, refresh: body.refresh_token };
}

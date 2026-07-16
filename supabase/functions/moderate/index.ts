// 디스코드 AI 판정 메시지의 [승인]/[반려] 버튼이 여는 심사 엔드포인트.
// judge-submission 이 서명(HMAC)해 둔 링크만 유효하다 — URL 추측으로는 처리 불가.
//
// GET 은 확인 화면만 보여주고 실제 처리는 확인 버튼(POST)에서 한다 — 디스코드·
// 메신저의 링크 미리보기 크롤러가 GET 을 날려도 제보가 처리되지 않도록 (오클릭 방지 겸).
//
// 승인: approved=true → 기존 승인 트리거가 제보자에게 알림·푸시.
// 반려: deleted_at + rejected_reason(판정 때 저장한 ai_reject_reason) → 015 트리거가
//       사유 포함 알림·푸시. 이미 처리된 제보는 상태만 안내한다 (중복 클릭 안전).
//
// 필요한 secrets: JUDGE_WEBHOOK_SECRET, DISCORD_WEBHOOK_URL (judge 와 공유)
// 배포 시 "Enforce JWT verification" 은 끈다 — 브라우저 링크라 JWT 를 실을 수 없고,
// 인증은 URL 서명으로 한다.

const SECRET = Deno.env.get('JUDGE_WEBHOOK_SECRET');
const DISCORD_URL = Deno.env.get('DISCORD_WEBHOOK_URL');
const SB_URL = Deno.env.get('SUPABASE_URL');
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// judge-submission 의 sign() 과 동일해야 한다
async function sign(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET ?? ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// 제보명·안내 문구는 사용자 입력이다 — HTML 에 끼워 넣기 전에 이스케이프
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function render(status: number, inner: string): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>모토맵 심사</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, sans-serif; background: #f5f5f7; }
  @media (prefers-color-scheme: dark) { body { background: #1c1c1e; } .card { background: #2c2c2e; color: #fff; } .detail { color: #98989e; } }
  .card { background: #fff; border-radius: 20px; padding: 36px 32px; max-width: 320px;
    text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .emoji { font-size: 44px; }
  h1 { font-size: 19px; margin: 14px 0 8px; }
  .detail { font-size: 14px; line-height: 1.5; color: #666; margin: 0 0 4px; word-break: keep-all; }
  button { margin-top: 18px; width: 100%; padding: 14px; border: 0; border-radius: 12px;
    font-size: 16px; font-weight: 700; color: #fff; cursor: pointer; }
  .approve { background: #34c759; }
  .reject { background: #ff3b30; }
</style></head><body><div class="card">${inner}</div></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function page(status: number, emoji: string, title: string, detail = ''): Response {
  return render(
    status,
    `<div class="emoji">${emoji}</div><h1>${title}</h1>` +
      (detail ? `<p class="detail">${detail}</p>` : ''),
  );
}

async function sb(path: string, init?: RequestInit) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY ?? '',
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

async function discordLog(content: string) {
  if (!DISCORD_URL) return;
  await fetch(DISCORD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const table = u.searchParams.get('t');
  const id = u.searchParams.get('id');
  const action = u.searchParams.get('a');
  const s = u.searchParams.get('s');

  if (
    !table || !id || !action || !s ||
    !['places', 'courses'].includes(table) ||
    !['approve', 'reject'].includes(action) ||
    !/^[0-9a-f-]{36}$/.test(id)
  ) {
    return page(400, '🤔', '잘못된 요청이에요');
  }
  if (s !== (await sign(`${table}:${id}:${action}`))) {
    return page(403, '🔒', '링크 서명이 올바르지 않아요');
  }

  const res = await sb(`${table}?id=eq.${id}&select=id,name,approved,deleted_at,ai_reject_reason`);
  const row = (await res.json())?.[0];
  if (!row) return page(404, '🫥', '제보를 찾을 수 없어요');

  const icon = table === 'places' ? '📍' : '🛣️';

  // 중복 클릭·교차 클릭은 현재 상태만 안내 (아무것도 바꾸지 않는다)
  if (row.deleted_at) {
    return page(200, '❌', '이미 반려된 제보예요', esc(row.name));
  }
  if (row.approved) {
    return page(
      200,
      '✅',
      '이미 승인된 제보예요',
      action === 'reject' ? `${esc(row.name)} — 승인된 제보를 내리려면 SQL 로 정리해 주세요.` : esc(row.name),
    );
  }

  // GET 은 확인 화면 — 링크 미리보기 크롤러·오클릭이 제보를 처리하지 못하게 POST 로만 실행
  if (req.method !== 'POST') {
    const isApprove = action === 'approve';
    return render(
      200,
      `<div class="emoji">${isApprove ? '✅' : '❌'}</div>` +
        `<h1>${isApprove ? '승인할까요?' : '반려할까요?'}</h1>` +
        `<p class="detail">${icon} ${esc(row.name)}</p>` +
        (!isApprove && row.ai_reject_reason
          ? `<p class="detail">안내 문구: ${esc(row.ai_reject_reason)}</p>`
          : '') +
        `<form method="post"><button class="${isApprove ? 'approve' : 'reject'}">` +
        `${isApprove ? '승인하기' : '반려하기'}</button></form>`,
    );
  }

  if (action === 'approve') {
    const r = await sb(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ approved: true }),
    });
    if (!r.ok) return page(500, '⚠️', '처리에 실패했어요', `HTTP ${r.status}`);
    await discordLog(`🟢 승인 완료 — ${icon} ${row.name}`);
    return page(200, '🎉', '승인 완료', `${esc(row.name)} — 제보자에게 반영 알림이 발송됐어요.`);
  }

  const r = await sb(`${table}?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deleted_at: new Date().toISOString(),
      rejected_reason: row.ai_reject_reason ?? null,
    }),
  });
  if (!r.ok) return page(500, '⚠️', '처리에 실패했어요', `HTTP ${r.status}`);
  await discordLog(
    `🔴 반려 완료 — ${icon} ${row.name}` +
      (row.ai_reject_reason ? `\n안내 문구: ${row.ai_reject_reason}` : ' (사유 없음 — 기본 문구 발송)'),
  );
  return page(
    200,
    '📮',
    '반려 완료',
    `${esc(row.name)} — 제보자에게 사유와 함께 알림이 발송됐어요.`,
  );
});

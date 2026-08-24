// 디스코드 AI 판정 메시지의 심사 링크가 여는 원클릭 엔드포인트.
// judge-submission 이 서명(HMAC)해 둔 링크만 유효하다 — URL 추측으로는 처리 불가.
//
// 응답은 JSON 이다 — Supabase 게이트웨이가 EF 의 text/html 을 안티피싱 정책으로
// text/plain(+CSP sandbox)으로 강제 교체해 HTML 확인 화면을 쓸 수 없다.
// 링크 탭 = 즉시 처리이고, 결과의 주 확인처는 디스코드 채널의 완료 로그다.
// 크롤러 방어: 봇 UA·HEAD 는 처리 없이 통과 + judge 가 URL 을 <> 로 감싸 임베드 억제.
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

function page(status: number, result: string, detail = ''): Response {
  return new Response(JSON.stringify({ result, ...(detail ? { detail } : {}) }, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sb(path: string, init?: RequestInit) {
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

// 링크 미리보기 크롤러의 GET 이 제보를 처리하지 못하게 봇 UA 는 조회조차 하지 않는다
const BOT_UA = /bot|crawler|spider|preview|discord|slack|telegram|whatsapp|facebook|twitter/i;

Deno.serve(async (req) => {
  if (req.method === 'HEAD') return new Response(null, { status: 200 });
  if (BOT_UA.test(req.headers.get('user-agent') ?? '')) {
    return page(200, '모토맵 심사 링크');
  }

  const u = new URL(req.url);
  const table = u.searchParams.get('t');
  const id = u.searchParams.get('id');
  const action = u.searchParams.get('a');
  const targetGuideId = u.searchParams.get('g') ?? '';
  const s = u.searchParams.get('s');

  if (table === 'riding_guide_submissions') {
    if (
      !id || !action || !s ||
      !['prepare_new', 'prepare_merge', 'reject'].includes(action) ||
      !/^[0-9a-f-]{36}$/.test(id) ||
      (action === 'prepare_merge' && !/^[0-9a-f-]{36}$/.test(targetGuideId))
    ) {
      return page(400, '잘못된 라이딩 추천 심사 요청이에요');
    }
    if (s !== (await sign(`${table}:${id}:${action}:${targetGuideId}`))) {
      return page(403, '링크 서명이 올바르지 않아요');
    }

    const response = await sb('rpc/resolve_riding_guide_submission_review', {
      method: 'POST',
      body: JSON.stringify({
        p_submission_id: id,
        p_action: action,
        p_target_guide_id: targetGuideId || null,
        p_acted_by: 'signed-link',
      }),
    });
    let payload: Record<string, unknown> | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = payload && typeof payload.message === 'string'
        ? payload.message.slice(0, 220)
        : `HTTP ${response.status}`;
      return page(500, '처리에 실패했어요', message);
    }

    const title = typeof payload?.guideTitle === 'string'
      ? payload.guideTitle
      : typeof payload?.submissionTitle === 'string'
        ? payload.submissionTitle
        : id;
    if (action === 'reject') {
      await discordLog(`🔴 라이딩 추천 제안 반려 완료 — ${title}`);
      return page(200, '❌ 반려 완료', `${title} — 제보자에게 사유와 함께 알림이 발송됐어요.`);
    }
    const mode = action === 'prepare_merge' ? '병합 대상 확정' : '비공개 초안 생성';
    await discordLog(`🟡 라이딩 추천 ${mode} — ${title}`);
    return page(
      200,
      `✅ ${mode}`,
      `${title} — 편집·검수 후 공개 완료해야 사용자에게 알림이 발송돼요.`,
    );
  }

  if (
    !table || !id || !action || !s ||
    !['places', 'courses'].includes(table) ||
    !['approve', 'reject'].includes(action) ||
    !/^[0-9a-f-]{36}$/.test(id)
  ) {
    return page(400, '잘못된 요청이에요');
  }
  if (s !== (await sign(`${table}:${id}:${action}`))) {
    return page(403, '링크 서명이 올바르지 않아요');
  }

  const res = await sb(`${table}?id=eq.${id}&select=id,name,approved,deleted_at,ai_reject_reason`);
  const row = (await res.json())?.[0];
  if (!row) return page(404, '제보를 찾을 수 없어요');

  const icon = table === 'places' ? '📍' : '🛣️';

  // 중복 클릭·교차 클릭은 현재 상태만 안내 (아무것도 바꾸지 않는다)
  if (row.deleted_at) {
    return page(200, '이미 반려된 제보예요', row.name);
  }
  if (row.approved) {
    return page(
      200,
      '이미 승인된 제보예요',
      action === 'reject' ? `${row.name} — 승인된 제보를 내리려면 SQL 로 정리해 주세요.` : row.name,
    );
  }

  if (action === 'approve') {
    const r = await sb(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ approved: true }),
    });
    if (!r.ok) return page(500, '처리에 실패했어요', `HTTP ${r.status}`);
    await discordLog(`🟢 승인 완료 — ${icon} ${row.name}`);
    return page(200, '✅ 승인 완료', `${row.name} — 제보자에게 반영 알림이 발송됐어요.`);
  }

  const r = await sb(`${table}?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deleted_at: new Date().toISOString(),
      rejected_reason: row.ai_reject_reason ?? null,
    }),
  });
  if (!r.ok) return page(500, '처리에 실패했어요', `HTTP ${r.status}`);
  await discordLog(
    `🔴 반려 완료 — ${icon} ${row.name}` +
      (row.ai_reject_reason ? `\n안내 문구: ${row.ai_reject_reason}` : ' (사유 없음 — 기본 문구 발송)'),
  );
  return page(200, '❌ 반려 완료', `${row.name} — 제보자에게 사유와 함께 알림이 발송됐어요.`);
});

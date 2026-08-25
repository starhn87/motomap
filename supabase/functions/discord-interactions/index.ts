// 디스코드 봇 인터랙션 엔드포인트 — Developer Portal 의 Interactions Endpoint URL 로 등록.
// 판정 메시지의 [승인]/[반려] 버튼과 건의 메시지의 [답변하기] 버튼(→ 인풋 모달)을 처리한다.
//
// 인증: 디스코드가 모든 요청을 Ed25519 로 서명한다 (X-Signature-Ed25519 + Timestamp).
// DISCORD_PUBLIC_KEY 로 검증 실패 시 401 — 디스코드 외에는 아무도 호출할 수 없으므로
// custom_id 에 별도 서명은 필요 없다.
//
// custom_id 규약:
//   mod:approve:places:<uuid> / mod:reject:courses:<uuid>  — 심사 실행
//   guide:prepare_new:<uuid>                               — 비공개 추천 초안 생성
//   guide:prepare_merge:<uuid>:<guide_uuid>                — 기존 추천 병합 준비
//   guide:reject:<uuid>                                    — 라이딩 추천 제안 반려
//   reply:feedback:<uuid>                                   — 답변 모달 열기
//   replymodal:feedback:<uuid>                              — 모달 제출 (답변 저장)
//   placechange:apply:<uuid> / placechange:dismiss:<uuid>   — 장소 변경 계획 처리
//   placereport:temporary|reopen|close|moved|dismiss:<uuid>  — 사용자 장소 변경 제보 처리
//
// 승인: approved=true → 승인 트리거가 알림·푸시. 반려: deleted_at+rejected_reason →
// 015 트리거가 사유 포함 알림·푸시. 답변: feedback.reply 저장 → 021 트리거가 알림·푸시.
// 처리 후 원 메시지를 업데이트해(버튼 제거 + 결과 표시) 중복 클릭을 시각적으로도 막는다.
//
// 필요한 secrets: DISCORD_PUBLIC_KEY (+ SUPABASE_URL/SERVICE_ROLE_KEY 자동 주입)
// 배포 시 "Enforce JWT verification" 은 끈다 — 호출자가 디스코드 서버다.

const PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY');
const SB_URL = Deno.env.get('SUPABASE_URL');
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const sig = req.headers.get('x-signature-ed25519');
  const ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts || !PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(PUBLIC_KEY),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(sig),
      new TextEncoder().encode(ts + rawBody),
    );
  } catch {
    return false;
  }
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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// 클릭한 사람에게만 보이는 짧은 안내 (원 메시지는 그대로)
function ephemeral(content: string): Response {
  return json({ type: 4, data: { content, flags: 64 } });
}

// 원 메시지를 결과로 교체 — 버튼을 떼고 처리 결과를 덧붙인다
function updateMessage(baseContent: string, resultLine: string): Response {
  const maxBaseLength = Math.max(0, 1900 - resultLine.length - 2);
  return json({
    type: 7,
    data: {
      content: `${baseContent.slice(0, maxBaseLength)}\n\n${resultLine}`,
      components: [],
    },
  });
}

const UUID_RE = /^[0-9a-f-]{36}$/;

// ── 심사 (승인/반려) ────────────────────────────────────────

async function handleModeration(
  action: string,
  table: string,
  id: string,
  baseContent: string,
): Promise<Response> {
  if (!['places', 'courses'].includes(table) || !UUID_RE.test(id)) {
    return ephemeral('잘못된 요청이에요.');
  }
  const res = await sb(`${table}?id=eq.${id}&select=id,name,approved,deleted_at,ai_reject_reason`);
  const row = (await res.json())?.[0];
  if (!row) return ephemeral('제보를 찾을 수 없어요. (이미 정리된 행일 수 있어요)');

  if (row.deleted_at) return ephemeral(`이미 반려된 제보예요 — ${row.name}`);
  if (row.approved) return ephemeral(`이미 승인된 제보예요 — ${row.name}`);

  if (action === 'approve') {
    const r = await sb(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ approved: true }),
    });
    if (!r.ok) return ephemeral(`처리에 실패했어요 (HTTP ${r.status})`);
    return updateMessage(baseContent, '🟢 **승인 완료** — 제보자에게 반영 알림이 발송됐어요.');
  }

  const r = await sb(`${table}?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deleted_at: new Date().toISOString(),
      rejected_reason: row.ai_reject_reason ?? null,
    }),
  });
  if (!r.ok) return ephemeral(`처리에 실패했어요 (HTTP ${r.status})`);
  return updateMessage(
    baseContent,
    '🔴 **반려 완료** — 제보자에게 사유와 함께 알림이 발송됐어요.',
  );
}

// ── 라이딩 추천 제안 (편집 준비/반려) ───────────────────────

async function handleRidingGuideReview(
  action: string,
  submissionId: string,
  targetGuideId: string | null,
  actorId: string,
  baseContent: string,
): Promise<Response> {
  if (
    !['prepare_new', 'prepare_merge', 'reject'].includes(action) ||
    !UUID_RE.test(submissionId) ||
    (action === 'prepare_merge' && (!targetGuideId || !UUID_RE.test(targetGuideId)))
  ) {
    return ephemeral('잘못된 라이딩 추천 심사 요청이에요.');
  }
  if (!/^\d{5,25}$/.test(actorId)) {
    return ephemeral('처리자 정보를 확인할 수 없어요.');
  }

  const response = await sb('rpc/resolve_riding_guide_submission_review', {
    method: 'POST',
    body: JSON.stringify({
      p_submission_id: submissionId,
      p_action: action,
      p_target_guide_id: targetGuideId,
      p_acted_by: `discord:${actorId}`,
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
    return ephemeral(`처리하지 못했어요 — ${message}`);
  }

  const submissionTitle = typeof payload?.submissionTitle === 'string'
    ? payload.submissionTitle
    : '라이딩 추천 제안';
  if (action === 'reject') {
    return updateMessage(
      baseContent,
      `🔴 **반려 완료** — ${submissionTitle} · <@${actorId}>`,
    );
  }

  const guideTitle = typeof payload?.guideTitle === 'string'
    ? payload.guideTitle
    : submissionTitle;
  const mode = action === 'prepare_merge' ? '병합 대상 확정' : '비공개 초안 생성';
  return updateMessage(
    baseContent,
    `🟡 **${mode}** — ${guideTitle} · <@${actorId}>\n` +
      '편집·검수 후 published/merged로 완료해야 사용자에게 알림이 발송돼요.',
  );
}

// ── 건의 답변 ───────────────────────────────────────────────

function openReplyModal(feedbackId: string): Response {
  return json({
    type: 9,
    data: {
      custom_id: `replymodal:feedback:${feedbackId}`,
      title: '건의 답변',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4, // Text Input
              custom_id: 'reply_text',
              label: '답변 내용 (건의자에게 알림·푸시로 전송돼요)',
              style: 2, // paragraph
              required: true,
              max_length: 1000,
              placeholder: '해요체 완결 문장으로 작성해 주세요.',
            },
          ],
        },
      ],
    },
  });
}

async function handleReplySubmit(
  feedbackId: string,
  reply: string,
  baseContent: string,
): Promise<Response> {
  if (!UUID_RE.test(feedbackId)) return ephemeral('잘못된 요청이에요.');
  const trimmed = reply.trim();
  if (!trimmed) return ephemeral('답변 내용이 비어 있어요.');

  // reply 저장 → 021 트리거가 건의자에게 인앱 알림 + 푸시를 보낸다
  const r = await sb(`feedback?id=eq.${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ reply: trimmed, reply_at: new Date().toISOString() }),
  });
  if (!r.ok) return ephemeral(`답변 저장에 실패했어요 (HTTP ${r.status})`);

  const preview = trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed;
  return updateMessage(baseContent, `✅ **답변 완료**\n> ${preview}`);
}

// ── 장소 변경 계획 승인 ─────────────────────────────────────

const PLACE_CHANGE_FIELD_LABELS: Record<string, string> = {
  name: '상호',
  address: '주소',
  phone: '전화번호',
  latitude: '위치',
  longitude: '위치',
  source_provider: '카카오 장소 연결',
  source_place_id: '카카오 장소 연결',
};

async function handlePlaceChange(
  action: string,
  reviewId: string,
  actorId: string,
  baseContent: string,
): Promise<Response> {
  if (!['apply', 'dismiss'].includes(action) || !UUID_RE.test(reviewId)) {
    return ephemeral('잘못된 장소 변경 요청이에요.');
  }
  if (!/^\d{5,25}$/.test(actorId)) {
    return ephemeral('처리자 정보를 확인할 수 없어요.');
  }

  const response = await sb('rpc/resolve_place_change_review', {
    method: 'POST',
    body: JSON.stringify({
      p_review_id: reviewId,
      p_decision: action,
      p_acted_by: `discord:${actorId}`,
    }),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message).slice(0, 220)
      : `HTTP ${response.status}`;
    return ephemeral(`처리하지 못했어요 — ${message}`);
  }

  const row = Array.isArray(payload) ? payload[0] : null;
  const placeName = row && typeof row.place_name === 'string'
    ? row.place_name
    : '장소';

  if (action === 'dismiss') {
    return updateMessage(
      baseContent,
      `⚪ **변경 없음으로 종료** — ${placeName} · <@${actorId}>`,
    );
  }

  const applied = row?.applied_changes && typeof row.applied_changes === 'object'
    ? Object.keys(row.applied_changes as Record<string, unknown>)
    : [];
  const labels = [...new Set(applied.map((key) => PLACE_CHANGE_FIELD_LABELS[key] ?? key))];
  return updateMessage(
    baseContent,
    `🟢 **계획대로 반영 완료** — ${placeName} · ${labels.join(', ')} · <@${actorId}>`,
  );
}

// ── 사용자 장소 변경 제보 승인 ─────────────────────────────

const PLACE_REPORT_DECISIONS: Record<string, string> = {
  temporary: 'mark_temporarily_closed',
  reopen: 'mark_operational',
  close: 'hide_permanently_closed',
  moved: 'hide_moved',
  dismiss: 'dismiss',
};

const PLACE_REPORT_RESULT_LABELS: Record<string, string> = {
  temporary: '임시 휴업 표시',
  reopen: '영업 재개 반영',
  close: '폐업 숨김',
  moved: '이전 장소 숨김',
};

async function handlePlaceReport(
  action: string,
  reportId: string,
  actorId: string,
  baseContent: string,
): Promise<Response> {
  const decision = PLACE_REPORT_DECISIONS[action];
  if (!decision || !UUID_RE.test(reportId)) {
    return ephemeral('잘못된 사용자 장소 정보 제보 요청이에요.');
  }
  if (!/^\d{5,25}$/.test(actorId)) {
    return ephemeral('처리자 정보를 확인할 수 없어요.');
  }

  const response = await sb('rpc/resolve_place_change_report', {
    method: 'POST',
    body: JSON.stringify({
      p_report_id: reportId,
      p_decision: decision,
      p_acted_by: `discord:${actorId}`,
    }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message).slice(0, 220)
      : `HTTP ${response.status}`;
    return ephemeral(`처리하지 못했어요 — ${message}`);
  }

  const row = Array.isArray(payload) ? payload[0] : null;
  const placeName = row && typeof row.place_name === 'string'
    ? row.place_name
    : '장소';
  if (action === 'dismiss') {
    return updateMessage(
      baseContent,
      `⚪ **변경 없음으로 종료** — ${placeName} · <@${actorId}>`,
    );
  }
  return updateMessage(
    baseContent,
    `🟢 **${PLACE_REPORT_RESULT_LABELS[action]} 완료** — ${placeName} · <@${actorId}>`,
  );
}

// ── 엔트리 ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) {
    return new Response('invalid signature', { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // 디스코드의 엔드포인트 검증 핑
  if (interaction.type === 1) return json({ type: 1 });

  const baseContent: string = interaction.message?.content ?? '';

  // 버튼 클릭
  if (interaction.type === 3) {
    const parts = String(interaction.data?.custom_id ?? '').split(':');
    if (parts[0] === 'mod' && parts.length === 4) {
      return handleModeration(parts[1], parts[2], parts[3], baseContent);
    }
    if (parts[0] === 'guide') {
      const actorId = String(
        interaction.member?.user?.id ?? interaction.user?.id ?? '',
      );
      if (parts[1] === 'prepare_merge' && parts.length === 4) {
        return handleRidingGuideReview(parts[1], parts[2], parts[3], actorId, baseContent);
      }
      if (['prepare_new', 'reject'].includes(parts[1]) && parts.length === 3) {
        return handleRidingGuideReview(parts[1], parts[2], null, actorId, baseContent);
      }
    }
    if (parts[0] === 'reply' && parts[1] === 'feedback' && parts.length === 3) {
      return openReplyModal(parts[2]);
    }
    if (parts[0] === 'placechange' && parts.length === 3) {
      const actorId = String(
        interaction.member?.user?.id ?? interaction.user?.id ?? '',
      );
      return handlePlaceChange(parts[1], parts[2], actorId, baseContent);
    }
    if (parts[0] === 'placereport' && parts.length === 3) {
      const actorId = String(
        interaction.member?.user?.id ?? interaction.user?.id ?? '',
      );
      return handlePlaceReport(parts[1], parts[2], actorId, baseContent);
    }
    return ephemeral('알 수 없는 버튼이에요.');
  }

  // 모달 제출
  if (interaction.type === 5) {
    const parts = String(interaction.data?.custom_id ?? '').split(':');
    if (parts[0] === 'replymodal' && parts[1] === 'feedback' && parts.length === 3) {
      const reply =
        interaction.data?.components?.[0]?.components?.[0]?.value ?? '';
      return handleReplySubmit(parts[2], reply, baseContent);
    }
    return ephemeral('알 수 없는 모달이에요.');
  }

  return ephemeral('지원하지 않는 인터랙션이에요.');
});

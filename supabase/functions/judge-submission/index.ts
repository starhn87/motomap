// 제보(장소·코스) AI 판정 — DB 트리거(notify_ai_judge)가 호출하는 Edge Function.
// 1) 카카오 로컬 교차검증 + 웹 검색으로 라이더 근거 조사 → 2) 구조화 판정 →
// 3) 결과(승인 추천/반려 추천/판단 유보 + 근거)를 디스코드로 발송.
// 판정은 "추천"일 뿐 — 승인/반려 결정은 관리자가 한다 (Phase A).
//
// 요청은 즉시 200을 반환하고 판정은 백그라운드(EdgeRuntime.waitUntil)에서 진행 —
// 호출자(pg_net)의 짧은 타임아웃이 판정을 중단시키지 않도록.
//
// 필요한 secrets (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY, KAKAO_REST_API_KEY, DISCORD_WEBHOOK_URL, JUDGE_WEBHOOK_SECRET
// 배포 시 "Enforce JWT verification" 은 끈다 — 인증은 x-judge-secret 헤더로 한다.
import Anthropic from 'npm:@anthropic-ai/sdk';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const KAKAO_KEY = Deno.env.get('KAKAO_REST_API_KEY');
const DISCORD_URL = Deno.env.get('DISCORD_WEBHOOK_URL');
const SECRET = Deno.env.get('JUDGE_WEBHOOK_SECRET');

const MODEL = 'claude-opus-4-8';

interface Verdict {
  verdict: 'approve' | 'reject' | 'uncertain';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'reject', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string', description: '판정 근거 (한국어, 1~3문장)' },
  },
  required: ['verdict', 'confidence', 'reason'],
  additionalProperties: false,
} as const;

const SYSTEM = `너는 "모토맵"(한국 오토바이 라이더용 지도 앱)의 제보 심사 보조자다.
지도에는 라이더에게 실질 가치가 있는 장소만 올린다.

판정 기준:
- 승인: 바이커 카페(라이더 집결지), 오토바이 정비소, 바이크 용품점, 라이딩 뷰포인트,
  라이더가 실제로 애용하는 휴게소·주유소처럼 "라이더 특화" 정체성의 근거가 있는 곳.
  제보 설명이 비어 있어도 웹 조사에서 라이더 커뮤니티·블로그가 라이딩 목적지로
  다루는 근거가 확인되면 승인해도 된다.
- 반려: "일반 장소"라는 적극적 근거가 있을 때 — 예: 조사 결과 평범한 카페/맛집이고
  라이더 관련 언급이 전혀 없음. "바이크 주차 가능", "라이더가 가기 좋음" 정도의
  설명만으로는 승인 근거가 되지 않는다(실제로 그런 일반 맛집을 관리자가 반려했다).
- 유보(uncertain): 근거가 없거나 상충할 때. 근거 부재는 반려가 아니라 유보다.
- 코스: 실제 라이딩 코스로서 정합성(경로·거리·설명), 장난/스팸 여부를 본다.

카테고리별 예외 — 맛집(restaurant)·주유소(gas_station)는 "라이더 전용" 업태가
사실상 없으므로 기준을 달리한다:
- 맛집: 라이더 커뮤니티·블로그·유튜브에서 라이딩 코스 맛집으로 반복 언급되거나,
  유명 라이딩 동선(집결지·와인딩·해안 코스) 위에 있고 주차가 넉넉하면 승인 근거가 된다.
- 주유소: 고급휘발유(고옥탄) 상시 취급, 또는 산간·장거리 코스의 마지막/유일 주유소처럼
  라이더에게 실질 정보 가치가 있으면 승인 근거가 된다. 평범한 도심 주유소는 반려.`;

async function kakaoLookup(name: string, address: string) {
  if (!KAKAO_KEY) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(name)}&size=3`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.documents ?? []).map((d: Record<string, string>) => ({
      place_name: d.place_name,
      category: d.category_name,
      road_address: d.road_address_name,
      address: d.address_name,
      matches_submitted_address:
        !!address && (d.road_address_name === address || d.address_name === address),
    }));
  } catch {
    return null;
  }
}

// 웹 검색으로 라이더 근거 조사 (서버 도구 — pause_turn 시 이어서 재요청)
async function webResearch(prompt: string): Promise<string> {
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
  let resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
    messages,
  });
  let guard = 0;
  while (resp.stop_reason === 'pause_turn' && guard++ < 3) {
    messages = [...messages, { role: 'assistant', content: resp.content }];
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
      messages,
    });
  }
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

async function judge(table: string, record: Record<string, unknown>): Promise<{ v: Verdict; evidence: string }> {
  let evidenceParts: string[] = [];
  let submitted = '';

  if (table === 'places') {
    submitted = JSON.stringify({
      name: record.name, category: record.category, address: record.address,
      description: record.description, tags: record.tags, phone: record.phone,
    });

    const kakao = await kakaoLookup(String(record.name ?? ''), String(record.address ?? ''));
    evidenceParts.push(
      '카카오 로컬: ' + (kakao === null
        ? '(조회 실패)'
        : kakao.length === 0
          ? '미등록 (비상호 장소이거나 존재 불명)'
          : JSON.stringify(kakao)),
    );

    // 웹 조사 — 제보 텍스트에 근거가 없어도 유명 라이더 스팟은 여기서 드러난다
    const web = await webResearch(
      `한국의 장소 "${record.name}" (주소: ${record.address ?? '?'}) 이(가) 오토바이 라이더들에게 ` +
      `알려진 곳인지 웹에서 조사하라. "${record.name} 바이크", "${record.name} 오토바이", "${record.name} 라이더" 등으로 검색해 ` +
      `라이더 커뮤니티·블로그·후기의 언급 여부를 확인하고, 발견한 근거를 한국어 3~5문장으로 요약하라. ` +
      `근거가 없으면 "라이더 관련 언급을 찾지 못함"이라고 명시하라.`,
    ).catch((e) => `(웹 조사 실패: ${String(e).slice(0, 120)})`);
    evidenceParts.push('웹 조사: ' + web);
  } else {
    const coordCount = Array.isArray(record.coordinates) ? record.coordinates.length : 0;
    submitted = JSON.stringify({
      name: record.name, description: record.description, tags: record.tags,
      distance_km: record.distance, duration_min: record.duration, waypoint_count: coordCount,
    });
    evidenceParts.push(`경유지 ${coordCount}개`);
  }

  const evidence = evidenceParts.join('\n');
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    messages: [{
      role: 'user',
      content: `${table === 'places' ? '장소' : '라이딩 코스'} 제보를 심사하라.\n제보 내용: ${submitted}\n\n교차검증 자료:\n${evidence}`,
    }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  return { v: JSON.parse(text) as Verdict, evidence };
}

async function postDiscord(content: string) {
  if (!DISCORD_URL) return;
  await fetch(DISCORD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
  });
}

const VERDICT_LABEL: Record<Verdict['verdict'], string> = {
  approve: '✅ 승인 추천',
  reject: '❌ 반려 추천',
  uncertain: '🤔 판단 유보',
};
const CONFIDENCE_LABEL: Record<Verdict['confidence'], string> = {
  high: '확신 높음', medium: '보통', low: '낮음',
};

async function judgeAndPost(table: string, record: Record<string, unknown>) {
  const icon = table === 'places' ? '📍' : '🛣️';
  try {
    const { v } = await judge(table, record);
    // 교차검증 원자료(evidence)는 판정 입력으로만 쓰고 노출하지 않는다 — reason 에 요약됨
    await postDiscord(
      `🤖 AI 판정 — ${icon} ${record.name}\n` +
      `**${VERDICT_LABEL[v.verdict]}** (${CONFIDENCE_LABEL[v.confidence]})\n` +
      `근거: ${v.reason}`,
    );
  } catch (e) {
    // 기본 제보 알림은 별도 트리거로 이미 발송됨 — 판정 실패만 알린다
    await postDiscord(`🤖 AI 판정 실패 — ${icon} ${record?.name ?? '?'}\n${String(e).slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-judge-secret') !== SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  const { table, record } = await req.json();
  // 즉시 200 — 판정(웹 검색 포함, 수십 초)은 백그라운드에서
  EdgeRuntime.waitUntil(judgeAndPost(table, record));
  return Response.json({ ok: true });
});

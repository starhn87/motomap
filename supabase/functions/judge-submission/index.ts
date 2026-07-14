// 제보(장소·코스) AI 판정 — DB 트리거(notify_ai_judge)가 호출하는 Edge Function.
// 장소는 카카오 로컬로 실장소를 교차검증한 뒤 Claude 가 바이크 특화 여부를 판정하고,
// 결과(승인 추천/반려 추천/판단 유보 + 근거)를 디스코드로 보낸다.
// 판정은 "추천"일 뿐 — 승인/반려 결정은 관리자가 한다 (Phase A).
//
// 필요한 secrets (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY, KAKAO_REST_API_KEY, DISCORD_WEBHOOK_URL, JUDGE_WEBHOOK_SECRET
// 배포 시 "Enforce JWT verification" 은 끈다 — 인증은 x-judge-secret 헤더로 한다.
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const KAKAO_KEY = Deno.env.get('KAKAO_REST_API_KEY');
const DISCORD_URL = Deno.env.get('DISCORD_WEBHOOK_URL');
const SECRET = Deno.env.get('JUDGE_WEBHOOK_SECRET');

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

승인 기준 (엄격):
- 바이커 카페(라이더 집결지), 오토바이 정비소, 바이크 용품점, 라이딩 뷰포인트,
  라이더가 실제로 애용하는 휴게소·주유소처럼 "라이더 특화" 정체성이 분명한 곳만 승인.
- 일반 카페·맛집은 "바이크 주차 가능", "라이더가 가기 좋음" 정도로는 부족 → 반려.
  (실제 사례: 설명에 "바이크 주차 문제없고 맛있다"고 적힌 일반 맛집도 관리자가 반려했다)
- 카카오 검색 결과와 제보 내용이 심하게 어긋나면(존재 불명·카테고리 불일치) 유보 또는 반려.
- 코스는 실제 라이딩 코스로서 말이 되는지(경로·거리·설명의 정합성), 장난/스팸 여부를 본다.
- 확신이 없으면 uncertain — 무리하게 승인하지 않는다.`;

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

async function judge(table: string, record: Record<string, unknown>): Promise<{ v: Verdict; evidence: string }> {
  let evidence = '';
  let task = '';

  if (table === 'places') {
    const kakao = await kakaoLookup(String(record.name ?? ''), String(record.address ?? ''));
    evidence = kakao === null
      ? '(카카오 조회 실패 — 제보 내용만으로 판단)'
      : kakao.length === 0
        ? '카카오에 등록되지 않은 이름 (비상호 장소이거나 존재 불명)'
        : JSON.stringify(kakao);
    task = `장소 제보를 심사하라.
제보 내용: ${JSON.stringify({
      name: record.name, category: record.category, address: record.address,
      description: record.description, tags: record.tags, phone: record.phone,
    })}
카카오 로컬 검색 결과(교차검증용): ${evidence}`;
  } else {
    const coordCount = Array.isArray(record.coordinates) ? record.coordinates.length : 0;
    task = `라이딩 코스 제보를 심사하라.
제보 내용: ${JSON.stringify({
      name: record.name, description: record.description, tags: record.tags,
      distance_km: record.distance, duration_min: record.duration, waypoint_count: coordCount,
    })}`;
    evidence = `경유지 ${coordCount}개`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    messages: [{ role: 'user', content: task }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  return { v: JSON.parse(text) as Verdict, evidence };
}

async function postDiscord(content: string) {
  if (!DISCORD_URL) return;
  await fetch(DISCORD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
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

Deno.serve(async (req) => {
  if (req.headers.get('x-judge-secret') !== SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const { table, record } = await req.json();
  const icon = table === 'places' ? '📍' : '🛣️';

  try {
    const { v, evidence } = await judge(table, record);
    await postDiscord(
      `🤖 AI 판정 — ${icon} ${record.name}\n` +
      `**${VERDICT_LABEL[v.verdict]}** (${CONFIDENCE_LABEL[v.confidence]})\n` +
      `근거: ${v.reason}\n` +
      `-# 교차검증: ${evidence.slice(0, 500)}`,
    );
  } catch (e) {
    // 기본 제보 알림은 별도 트리거로 이미 발송됨 — 판정 실패만 알린다
    await postDiscord(`🤖 AI 판정 실패 — ${icon} ${record?.name ?? '?'}\n${String(e).slice(0, 300)}`);
  }

  return Response.json({ ok: true });
});

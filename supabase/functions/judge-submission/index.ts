// 제보(장소·라이딩 추천·레거시 코스) AI 판정 — DB 트리거가 호출하는 Edge Function.
// 1) 카카오 로컬 교차검증 + 웹 검색으로 라이더 근거 조사 → 2) 구조화 판정 →
// 3) 결과와 근거를 디스코드로 발송. 장소·레거시 코스는 승인/반려, 라이딩 추천은
//    새 추천 준비/병합 준비/반려 버튼으로 사람이 최종 선택한다.
//    반려될 경우 제보자에게 보낼 문구(userReason)는 판정 시점에 만들어
//    ai_reject_reason 에 저장해 두고, 반려 시 moderate 가 rejected_reason 으로 복사한다.
//
// 요청은 즉시 200을 반환하고 판정은 백그라운드(EdgeRuntime.waitUntil)에서 진행 —
// 호출자(pg_net)의 짧은 타임아웃이 판정을 중단시키지 않도록.
//
// 필요한 secrets (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY, KAKAO_REST_API_KEY, DISCORD_WEBHOOK_URL, JUDGE_WEBHOOK_SECRET
//   DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (봇 버튼 발송 — 없으면 웹훅 링크로 폴백)
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입)
// 배포 시 "Enforce JWT verification" 은 끈다 — 인증은 x-judge-secret 헤더로 한다.
import Anthropic from 'npm:@anthropic-ai/sdk@0.116.0';
import {
  SUBMISSION_POLICY_PROMPT,
  SUBMISSION_POLICY_RULE_IDS,
  SUBMISSION_POLICY_VERSION,
} from '../_shared/submissionPolicy.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const KAKAO_KEY = Deno.env.get('KAKAO_REST_API_KEY');
const DISCORD_URL = Deno.env.get('DISCORD_WEBHOOK_URL');
const SECRET = Deno.env.get('JUDGE_WEBHOOK_SECRET');
const SB_URL = Deno.env.get('SUPABASE_URL');
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// 판정은 명확한 기준의 분류 + 짧은 문구 생성 — Sonnet 이 품질·비용 균형점.
// 토큰의 대부분은 웹 검색 결과 입력이라 모델 단가가 곧 판정 단가다 (Opus 대비 ~1/5).
const MODEL = 'claude-sonnet-5';

interface Verdict {
  verdict: 'approve' | 'reject' | 'uncertain';
  confidence: 'high' | 'medium' | 'low';
  criteria: string[];
  reason: string;
  userReason: string;
}

interface RidingGuideVerdict {
  resolution: 'new_guide' | 'merge_existing' | 'reject' | 'uncertain';
  confidence: 'high' | 'medium' | 'low';
  criteria: string[];
  reason: string;
  userReason: string;
  mergeGuideId: string;
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'reject', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    criteria: {
      type: 'array',
      items: { type: 'string', enum: SUBMISSION_POLICY_RULE_IDS },
      minItems: 1,
      description: '판정에 직접 사용한 승인 기준 규칙 ID를 중요도 순으로 1~6개',
    },
    reason: { type: 'string', description: '판정 근거 (한국어, 1~3문장)' },
    userReason: {
      type: 'string',
      description:
        '이 제보가 반려될 경우 제보자 알림에 들어갈 안내. verdict 와 무관하게 항상 작성. ' +
        '한국어 해요체 완결 문장 1~2개. 알림 본문 "○○를 검토했지만 이번에는 담지 못했어요." 뒤에 ' +
        '그대로 이어지므로 이유만 담백하게. 예: "라이더분들 사이에서 알려진 곳인지 확인하기 어려웠어요." ' +
        '내부 판정 용어(카카오 로컬, 웹 조사, confidence 등)는 쓰지 않는다.',
    },
  },
  required: ['verdict', 'confidence', 'criteria', 'reason', 'userReason'],
  additionalProperties: false,
} as const;

const RIDING_GUIDE_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    resolution: {
      type: 'string',
      enum: ['new_guide', 'merge_existing', 'reject', 'uncertain'],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    criteria: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'COMMON-IDENTITY',
          'COMMON-EVIDENCE',
          'COMMON-SAFETY',
          'COMMON-DUPLICATE',
          'COMMON-CONTENT',
          'GUIDE-PLACE-IDENTITY',
          'GUIDE-RIDER-VALUE',
          'GUIDE-ROAD-SAFETY',
          'GUIDE-DUPLICATE',
          'GUIDE-EDITORIAL',
        ],
      },
      minItems: 1,
      description: '판정에 직접 사용한 규칙 ID를 중요도 순으로 1~6개',
    },
    reason: { type: 'string', description: '운영자에게 보여줄 판정 근거 (한국어, 1~4문장)' },
    userReason: {
      type: 'string',
      description:
        '반려 시 사용자에게 보낼 이유만 담은 한국어 해요체 1~2문장. 내부 판정 용어는 쓰지 않는다.',
    },
    mergeGuideId: {
      type: 'string',
      description: 'merge_existing이면 기존 추천 id, 나머지는 빈 문자열',
    },
  },
  required: ['resolution', 'confidence', 'criteria', 'reason', 'userReason', 'mergeGuideId'],
  additionalProperties: false,
} as const;

const SYSTEM = `너는 "모토맵"(한국 오토바이 라이더용 지도 앱)의 제보 심사 보조자다.
지도에는 라이더에게 실질 가치가 있고 안전하게 이용할 수 있는 장소와 라이딩 추천만 올린다.
지원 중인 구버전의 고정 경로 코스 제보는 레거시 기준으로 별도 처리한다.

${SUBMISSION_POLICY_PROMPT}`;

interface KakaoEvidence {
  place_name: string;
  category: string;
  road_address: string;
  address: string;
  matches_submitted_address: boolean;
  lat: number;
  lng: number;
}

async function duplicateEvidence(
  table: string,
  record: Record<string, unknown>,
): Promise<string> {
  if (!SB_URL || !SB_KEY) return '(조회 불가)';

  const queries = table === 'places'
    ? [
        ['address', String(record.address ?? '').trim()],
        ['name', String(record.name ?? '').trim()],
      ]
    : [['name', String(record.name ?? '').trim()]];

  try {
    const candidates = await Promise.all(queries.filter(([, value]) => value).map(async ([field, value]) => {
      const params = new URLSearchParams({
        select: 'id,name,approved',
        id: `neq.${String(record.id)}`,
        deleted_at: 'is.null',
        [field]: `eq.${value}`,
        limit: '5',
      });
      const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json() as { id: string; name: string; approved: boolean }[];
    }));
    const unique = [...new Map(candidates.flat().map((row) => [row.id, row])).values()];
    return unique.length === 0
      ? '정확히 같은 이름·주소의 활성 장소/코스 없음'
      : JSON.stringify(unique.map((row) => ({ name: row.name, status: row.approved ? 'approved' : 'pending' })));
  } catch {
    return '(조회 실패 — 중복 여부 판단 유보)';
  }
}

async function kakaoLookup(name: string, address: string): Promise<KakaoEvidence[] | null> {
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
      // 영업시간 대조용 좌표. 심사 프롬프트에는 싣지 않는다
      lat: Number(d.y),
      lng: Number(d.x),
    }));
  } catch {
    return null;
  }
}

/**
 * 제보된 영업시간을 구글과 대조한다. 참고용이다 — 어긋난다고 반려하지 않는다.
 * 라이더 카페처럼 작은 가게는 현장에 다녀온 제보자가 구글보다 정확할 때가 많고,
 * 구글에 영업시간이 아예 없는 장소도 흔하다.
 */
async function googleHoursEvidence(
  record: Record<string, unknown>,
  lat: number,
  lng: number,
): Promise<string | null> {
  const submitted = record.hours ?? record.opening_hours;
  if (!submitted) return null; // 제보에 영업시간이 없으면 대조할 것도 없다
  if (!SB_URL || !SB_KEY) return null;

  try {
    const res = await fetch(`${SB_URL}/functions/v1/place-hours`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceKey: `place:${record.id}`,
        name: String(record.name ?? ''),
        lat,
        lng,
      }),
    });
    if (!res.ok) return '(구글 조회 실패)';
    const { hours } = await res.json();
    if (!hours) return '구글에 영업시간 정보 없음 — 대조 불가';
    return `제보 ${JSON.stringify(submitted)} / 구글 ${JSON.stringify(hours)}`;
  } catch {
    return '(구글 조회 실패)';
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

interface GuideStopEvidence {
  position: number;
  role: 'primary' | 'stop';
  place_id: string | null;
  general_place_id: string | null;
  note: string | null;
}

interface GuideEvidenceRow {
  id: string;
  title: string;
  summary: string;
  featured_roads: string[] | null;
  tags: string[] | null;
}

async function judgeRidingGuideSubmission(
  record: Record<string, unknown>,
): Promise<{ verdict: RidingGuideVerdict; mergeGuideTitle: string | null }> {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase service configuration missing');
  const submissionId = String(record.id ?? '');
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const [submittedStopsRes, guidesRes, guideStopsRes] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/riding_guide_submission_stops?submission_id=eq.${submissionId}&select=position,role,place_id,general_place_id,note&order=position.asc`,
      { headers },
    ),
    fetch(
      `${SB_URL}/rest/v1/riding_guides?published_at=not.is.null&deleted_at=is.null&select=id,title,summary,featured_roads,tags`,
      { headers },
    ),
    fetch(
      `${SB_URL}/rest/v1/riding_guide_stops?select=guide_id,position,role,place_id,general_place_id,note&order=position.asc`,
      { headers },
    ),
  ]);
  if (!submittedStopsRes.ok || !guidesRes.ok || !guideStopsRes.ok) {
    throw new Error(
      `라이딩 추천 근거 로드 실패 ${submittedStopsRes.status}/${guidesRes.status}/${guideStopsRes.status}`,
    );
  }

  const submittedStops = (await submittedStopsRes.json()) as GuideStopEvidence[];
  if (!submittedStops.some((stop) => stop.role === 'primary')) {
    throw new Error('대표 목적지를 아직 조회하지 못했습니다. 재시도 대상입니다.');
  }
  const guides = (await guidesRes.json()) as GuideEvidenceRow[];
  const guideStops = (await guideStopsRes.json()) as (GuideStopEvidence & { guide_id: string })[];
  const allStops = [...submittedStops, ...guideStops];
  const registeredIds = [...new Set(allStops.flatMap((stop) => stop.place_id ? [stop.place_id] : []))];
  const generalIds = [...new Set(allStops.flatMap((stop) => stop.general_place_id ? [stop.general_place_id] : []))];
  const emptyResponse = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  const [placesRes, generalRes] = await Promise.all([
    registeredIds.length
      ? fetch(
          `${SB_URL}/rest/v1/places?id=in.(${registeredIds.join(',')})&select=id,name,address,approved,deleted_at`,
          { headers },
        )
      : emptyResponse(),
    generalIds.length
      ? fetch(
          `${SB_URL}/rest/v1/general_places?id=in.(${generalIds.join(',')})&select=id,name,address,provider,provider_place_id,promoted_place_id`,
          { headers },
        )
      : emptyResponse(),
  ]);
  if (!placesRes.ok || !generalRes.ok) {
    throw new Error(`라이딩 추천 장소 로드 실패`);
  }

  const registered = await placesRes.json() as {
    id: string;
    name: string;
    address: string;
    approved: boolean;
    deleted_at: string | null;
  }[];
  const general = await generalRes.json() as {
    id: string;
    name: string;
    address: string;
    provider: string;
    provider_place_id: string;
    promoted_place_id: string | null;
  }[];
  const placeMap = new Map(registered.map((place) => [`place:${place.id}`, place]));
  const generalMap = new Map(general.map((place) => [`general:${place.id}`, place]));
  const resolveStop = (stop: GuideStopEvidence) => {
    const target = stop.place_id
      ? placeMap.get(`place:${stop.place_id}`)
      : stop.general_place_id
        ? generalMap.get(`general:${stop.general_place_id}`)
        : undefined;
    return {
      role: stop.role,
      identity: stop.place_id ? `place:${stop.place_id}` : `general:${stop.general_place_id}`,
      name: target?.name ?? '(장소 정보 없음)',
      address: target?.address ?? '',
      note: stop.note,
    };
  };

  const submitted = submittedStops.map(resolveStop);
  const existingGuides = guides.map((guide) => ({
    id: guide.id,
    title: guide.title,
    summary: guide.summary,
    featuredRoads: guide.featured_roads ?? [],
    tags: guide.tags ?? [],
    places: guideStops
      .filter((stop) => stop.guide_id === guide.id)
      .map(resolveStop),
  }));
  const primary = submitted.find((stop) => stop.role === 'primary');
  const web = await webResearch(
    `라이딩 추천 제안의 사실성과 안전성을 조사하라. 대표 목적지는 "${primary?.name}" ` +
    `(주소: ${primary?.address || '?'})이고 함께 들를 곳은 ` +
    `${submitted.filter((stop) => stop.role === 'stop').map((stop) => stop.name).join(', ') || '없음'}이다. ` +
    `추천 도로 문구는 ${(record.featured_roads as string[] | undefined)?.join(', ') || '없음'}이다. ` +
    `장소가 현재 식별되는지, 추천 도로에 이륜차 통행 금지인 고속도로·자동차전용도로·상시 통제 ` +
    `구간이 포함되는지 공식·현재성 있는 출처를 우선해 확인하고 한국어 3~6문장으로 요약하라. ` +
    `확인할 수 없는 항목은 확인 불가라고 명시하라.`,
  ).catch((error) => `(웹 조사 실패: ${String(error).slice(0, 120)})`);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: RIDING_GUIDE_VERDICT_SCHEMA } },
    messages: [{
      role: 'user',
      content:
        `라이딩 추천 제안을 심사하라.\n` +
        `제안: ${JSON.stringify({
          title: record.title,
          reason: record.reason,
          featuredRoads: record.featured_roads,
          tags: record.tags,
          places: submitted,
        })}\n\n` +
        `기존 공개 추천: ${JSON.stringify(existingGuides)}\n\n` +
        `외부 조사: ${web}\n\n` +
        `등록 장소 승인 기준은 적용하지 마라. 실질적으로 같은 기존 추천에 보완 가치가 있으면 ` +
        `merge_existing과 해당 id를, 별도 편집 가치가 있으면 new_guide를 제안하라. ` +
        `불확실한 추천 도로 문구만 제거해도 목적지 가치가 남으면 전체를 곧바로 reject하지 마라.`,
    }],
  });

  const text = response.content.find((block) => block.type === 'text')?.text ?? '{}';
  const parsed = JSON.parse(text) as RidingGuideVerdict;
  const mergeGuide = guides.find((guide) => guide.id === parsed.mergeGuideId);
  const resolution = parsed.resolution === 'merge_existing' && !mergeGuide
    ? 'uncertain'
    : parsed.resolution;
  const verdict = {
    ...parsed,
    resolution,
    mergeGuideId: resolution === 'merge_existing' ? parsed.mergeGuideId : '',
    criteria: parsed.criteria.slice(0, 6),
  };
  return { verdict, mergeGuideTitle: mergeGuide?.title ?? null };
}

async function judge(table: string, record: Record<string, unknown>): Promise<{ v: Verdict; evidence: string }> {
  const evidenceParts: string[] = [];
  let submitted = '';

  evidenceParts.push('중복 대조: ' + await duplicateEvidence(table, record));

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
          // 좌표는 대조에만 쓰고 프롬프트에서는 뺀다
          : JSON.stringify(kakao.map(({ lat: _lat, lng: _lng, ...rest }) => rest))),
    );

    // 좌표는 카카오 첫 결과에서 빌린다 — places.location 은 PostGIS 라 REST 로 못 푼다
    const spot = kakao?.[0];
    if (spot && Number.isFinite(spot.lat) && Number.isFinite(spot.lng)) {
      const hoursEvidence = await googleHoursEvidence(record, spot.lat, spot.lng);
      if (hoursEvidence) evidenceParts.push('영업시간 대조(참고): ' + hoursEvidence);
    }

    const categoryResearch = record.category === 'camping'
      ? '특히 운영자·공공기관·공식 예약 페이지에서 바이크나 차량이 배정 사이트까지 진입해 ' +
        '사이트 안 또는 바로 옆에 주차하는 오토캠핑인지 확인하라. 별도 주차장에서 짐을 옮기는 ' +
        '일반 야영장이라면 그 사실을 명시하라.'
      : '카테고리에 맞는 라이더 특화 가치와 오토바이의 안전한 진입·주차 근거를 확인하라.';

    // 웹 조사 — 제보 텍스트에 근거가 없어도 유명 라이더 스팟은 여기서 드러난다
    const web = await webResearch(
      `한국의 장소 "${record.name}" (주소: ${record.address ?? '?'}) 이(가) 오토바이 라이더들에게 ` +
      `알려진 곳인지 웹에서 조사하라. "${record.name} 바이크", "${record.name} 오토바이", "${record.name} 라이더" 등으로 검색해 ` +
      `운영자·공공기관·공식 브랜드처럼 현재성이 있는 출처를 우선하고, 라이더 커뮤니티·블로그·후기의 ` +
      `언급 여부도 확인하라. ${categoryResearch} 발견한 근거를 한국어 3~5문장으로 요약하라. ` +
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
      content:
        `${table === 'places' ? '장소' : '라이딩 코스'} 제보를 심사하라.\n` +
        `제보 내용: ${submitted}\n\n교차검증 자료:\n${evidence}\n\n` +
        // 영업시간이 어긋난다고 반려하면 정확한 제보를 걸러내게 된다 — 작은
        // 라이더 가게는 현장에 다녀온 제보자가 구글보다 정확할 때가 많다
        `"영업시간 대조" 항목은 참고용이다. 이 항목만을 이유로 반려하지 말고, ` +
        `장소 자체의 실재·적합성으로 판정하라. 어긋남이 눈에 띄면 근거에 한 줄 언급만 남겨라.`,
    }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  const verdict = JSON.parse(text) as Verdict;
  return { v: { ...verdict, criteria: verdict.criteria.slice(0, 6) }, evidence };
}

const BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN');
const CHANNEL_ID = Deno.env.get('DISCORD_CHANNEL_ID');

// moderate EF 링크 서명 — 버튼 URL 위조 방지 (봇 미설정 시 폴백 링크에만 사용)
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

async function moderateUrl(table: string, id: string, action: 'approve' | 'reject') {
  const s = await sign(`${table}:${id}:${action}`);
  return `${SB_URL}/functions/v1/moderate?t=${table}&id=${id}&a=${action}&s=${s}`;
}

async function guideModerateUrl(
  id: string,
  action: 'prepare_new' | 'prepare_merge' | 'reject',
  guideId = '',
) {
  const s = await sign(`riding_guide_submissions:${id}:${action}:${guideId}`);
  const guideParam = guideId ? `&g=${guideId}` : '';
  return `${SB_URL}/functions/v1/moderate?t=riding_guide_submissions&id=${id}&a=${action}${guideParam}&s=${s}`;
}

// 판정과 함께 만든 제보자용 반려 문구를 저장 — 실패해도 판정 발송은 계속한다
async function saveUserReason(table: string, id: string, userReason: string) {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ai_reject_reason: userReason }),
    });
  } catch {
    // 저장 실패 시 반려 버튼은 기본 문구로 나간다
  }
}

async function saveRidingGuideVerdict(id: string, verdict: RidingGuideVerdict) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase service configuration missing');
  const response = await fetch(`${SB_URL}/rest/v1/riding_guide_submissions?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ai_recommendation: verdict,
      ai_judged_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`AI 판정 저장 실패 ${response.status}`);
}

// 봇이 설정돼 있으면 채널 메시지 API 로 진짜 버튼을 단다 (클릭은 discord-interactions
// EF 가 처리). 봇 미설정·발송 실패 시엔 웹훅 + 마스크드 링크(moderate EF)로 폴백 —
// 일반 인커밍 웹훅은 버튼(components)을 200 OK 로 조용히 무시하기 때문.
async function postDiscord(
  content: string,
  actions?: { label: string; style: number; customId: string; url: string }[],
) {
  if (BOT_TOKEN && CHANNEL_ID) {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content.slice(0, 1900),
        components: actions?.length
          ? [
              {
                type: 1,
                components: actions.map((a) => ({
                  type: 2,
                  style: a.style,
                  label: a.label,
                  custom_id: a.customId,
                })),
              },
            ]
          : undefined,
      }),
    });
    if (res.ok) return;
  }
  if (!DISCORD_URL) return;
  const linkLine = actions?.length
    ? '\n' + actions.map((a) => `[${a.label}](<${a.url}>)`).join(' · ')
    : '';
  await fetch(DISCORD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: (content + linkLine).slice(0, 1900) }),
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
const GUIDE_RESOLUTION_LABEL: Record<RidingGuideVerdict['resolution'], string> = {
  new_guide: '✅ 새 추천 준비 제안',
  merge_existing: '🔀 기존 추천 병합 제안',
  reject: '❌ 반려 추천',
  uncertain: '🤔 판단 유보',
};

async function judgeAndPost(table: string, record: Record<string, unknown>) {
  if (table === 'riding_guide_submissions') {
    const id = String(record.id ?? '');
    const title = String(record.title ?? '라이딩 추천 제안');
    try {
      const { verdict, mergeGuideTitle } = await judgeRidingGuideSubmission(record);
      await saveRidingGuideVerdict(id, verdict);
      const actions = [
        {
          label: '새 추천 준비',
          style: 3,
          customId: `guide:prepare_new:${id}`,
          url: await guideModerateUrl(id, 'prepare_new'),
        },
        ...(verdict.resolution === 'merge_existing' && verdict.mergeGuideId
          ? [{
              label: '병합 준비',
              style: 1,
              customId: `guide:prepare_merge:${id}:${verdict.mergeGuideId}`,
              url: await guideModerateUrl(id, 'prepare_merge', verdict.mergeGuideId),
            }]
          : []),
        {
          label: '반려',
          style: 4,
          customId: `guide:reject:${id}`,
          url: await guideModerateUrl(id, 'reject'),
        },
      ];
      await postDiscord(
        `🤖 AI 판정 — 🧭 ${title}\n` +
        `**${GUIDE_RESOLUTION_LABEL[verdict.resolution]}** (${CONFIDENCE_LABEL[verdict.confidence]})\n` +
        (mergeGuideTitle ? `병합 대상: ${mergeGuideTitle} (${verdict.mergeGuideId})\n` : '') +
        `기준: ${SUBMISSION_POLICY_VERSION} · ${verdict.criteria.join(', ')}\n` +
        `근거: ${verdict.reason}\n` +
        `반려 시 안내 문구: ${verdict.userReason}\n` +
        `새 추천·병합 버튼은 편집 준비만 하며, 검수 후 공개 완료 때 사용자에게 알려요.`,
        actions,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('riding guide submission judge failed', { id, error: message.slice(0, 500) });
      await postDiscord(`🤖 AI 판정 실패 — 🧭 ${title}\n${message.slice(0, 300)}`);
    }
    return;
  }

  const icon = table === 'places' ? '📍' : '🛣️';
  try {
    const { v } = await judge(table, record);
    const id = String(record.id);
    // 반려 버튼을 누르면 이 문구가 rejected_reason 으로 복사된다 (verdict 무관 항상 저장)
    await saveUserReason(table, id, v.userReason);
    // 교차검증 원자료(evidence)는 판정 입력으로만 쓰고 노출하지 않는다 — reason 에 요약됨
    await postDiscord(
      `🤖 AI 판정 — ${icon} ${record.name}\n` +
      `**${VERDICT_LABEL[v.verdict]}** (${CONFIDENCE_LABEL[v.confidence]})\n` +
      `기준: ${SUBMISSION_POLICY_VERSION} · ${v.criteria.join(', ')}\n` +
      `근거: ${v.reason}\n` +
      `반려 시 안내 문구: ${v.userReason}`,
      [
        {
          label: '승인',
          style: 3, // 초록
          customId: `mod:approve:${table}:${id}`,
          url: await moderateUrl(table, id, 'approve'),
        },
        {
          label: '반려',
          style: 4, // 빨강
          customId: `mod:reject:${table}:${id}`,
          url: await moderateUrl(table, id, 'reject'),
        },
      ],
    );
  } catch (e) {
    // 기본 제보 알림은 별도 트리거로 이미 발송됨 — 판정 실패만 알린다
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('judge-submission failed', {
      table,
      recordId: String(record?.id ?? ''),
      error: errorMessage.slice(0, 500),
    });
    await postDiscord(`🤖 AI 판정 실패 — ${icon} ${record?.name ?? '?'}\n${errorMessage.slice(0, 300)}`);
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

// 모토맵 AI 추천 챗 — 앱에 등록된 장소·코스 안에서만 추천하는 대화형 도우미.
//
// 요청(POST JSON): { messages: [{ role: 'user'|'assistant', content: string }],
//                    location?: { latitude, longitude } }
// 응답: { reply: string, places: PlaceCard[], courses: CourseCard[] }
//
// - 데이터셋(승인·미삭제 장소/코스)은 인메모리 5분 캐시. 위치가 오면 서버에서
//   각 항목까지의 거리를 계산해 모델에 준다 (모델 거리 추정은 부정확하므로).
// - 구조화 출력(tool 강제)으로 placeId/courseId 를 받아 실존 항목만 카드로 반환 —
//   목록에 없는 id 는 버려져 환각이 사용자에게 닿지 않는다.
//
// secrets: ANTHROPIC_API_KEY (judge-submission 과 공유), SUPABASE_URL/SERVICE_ROLE_KEY(자동)

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MODEL = 'claude-haiku-4-5-20251001';

interface PlaceRow {
  id: string;
  name: string;
  category: string;
  address: string;
  tags: string[] | null;
  description: string | null;
  latitude: number;
  longitude: number;
}

interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  distance: number;
  duration: number;
  difficulty: string;
  tags: string[] | null;
  coordinates: [number, number][];
}

// datasetText 는 위치 무관(전 사용자 동일)이라 Anthropic prompt cache 의 캐시 대상이 된다.
// 같은 문자열을 5분간 재사용해야 캐시가 히트하므로 여기서 만들어 함께 보관한다.
let cache: {
  places: PlaceRow[];
  courses: CourseRow[];
  datasetText: string;
  exp: number;
} | null = null;

async function loadData() {
  if (cache && cache.exp > Date.now()) return cache;
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const [pRes, cRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/rpc/all_places`,
      { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ category_filter: null }) },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/courses?approved=is.true&deleted_at=is.null&select=id,name,description,distance,duration,difficulty,tags,coordinates`,
      { headers },
    ),
  ]);
  if (!pRes.ok || !cRes.ok) throw new Error(`데이터 로드 실패 ${pRes.status}/${cRes.status}`);
  const places = (await pRes.json()) as PlaceRow[];
  const courses = (await cRes.json()) as CourseRow[];
  cache = { places, courses, datasetText: buildDataset(places, courses), exp: Date.now() + 5 * 60 * 1000 };
  return cache;
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (aLat - bLat) * 111;
  const dLng = (aLng - bLng) * 88;
  return Math.round(Math.hypot(dLat, dLng) * 10) / 10;
}

const CATEGORY_LABELS: Record<string, string> = {
  cafe: '카페',
  restaurant: '맛집',
  rest_stop: '휴게소',
  gas_station: '주유소',
  repair_shop: '정비소',
  viewpoint: '뷰포인트',
  gear_shop: '용품점',
  camping: '캠핑',
};

// 거리 없이(위치 무관) 만들어 전 사용자·전 요청이 같은 문자열을 공유하게 한다 —
// 여기 거리를 박으면 사용자마다 문자열이 달라져 prompt cache 가 매번 미스난다
function buildDataset(places: PlaceRow[], courses: CourseRow[]): string {
  const placeLines = places.map((p) => {
    const tags = p.tags?.length ? ` [${p.tags.join(',')}]` : '';
    return `- id:${p.id} | ${p.name} | ${CATEGORY_LABELS[p.category] ?? p.category} | ${p.address}${tags} | ${p.description ?? ''}`;
  });
  const courseLines = courses.map((c) => {
    const tags = c.tags?.length ? ` [${c.tags.join(',')}]` : '';
    return `- id:${c.id} | ${c.name} | ${c.distance}km ${c.duration}분 ${c.difficulty}${tags} | ${c.description ?? ''}`;
  });
  return `## 장소 (${places.length}곳)\n${placeLines.join('\n')}\n\n## 코스 (${courses.length}개)\n${courseLines.join('\n')}`;
}

// 위치가 있을 때만 붙는 가변 블록 — 가까운 장소 상위 30곳 + 모든 코스 출발지까지의 거리
function buildNearbySummary(
  places: PlaceRow[],
  courses: CourseRow[],
  loc: { latitude: number; longitude: number },
): string {
  const nearest = places
    .map((p) => ({ p, d: km(loc.latitude, loc.longitude, p.latitude, p.longitude) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 30)
    .map(({ p, d }) => `- id:${p.id} | ${p.name} | ${d}km`);
  const courseDists = courses
    .map((c) => {
      const start = c.coordinates?.[0];
      return start
        ? `- id:${c.id} | ${c.name} | 출발지까지 ${km(loc.latitude, loc.longitude, start[1], start[0])}km`
        : null;
    })
    .filter(Boolean);
  return `사용자 현재 위치: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}

## 현재 위치에서 가까운 장소 Top 30 (거리순)
${nearest.join('\n')}

## 코스 출발지까지 거리
${courseDists.join('\n')}`;
}

const RECOMMEND_TOOL = {
  name: 'recommend',
  description: '사용자에게 보여줄 답변과 추천 항목을 반환한다',
  input_schema: {
    type: 'object' as const,
    properties: {
      reply: {
        type: 'string',
        description: '한국어 답변 (2~5문장, 해요체, 마크다운 금지). 추천 이유를 간결히.',
      },
      placeIds: {
        type: 'array',
        items: { type: 'string' },
        description: '추천 장소 id (0~5개, 데이터셋의 id 그대로)',
      },
      courseIds: {
        type: 'array',
        items: { type: 'string' },
        description: '추천 코스 id (0~3개, 데이터셋의 id 그대로)',
      },
    },
    required: ['reply', 'placeIds', 'courseIds'],
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  let body: {
    messages?: { role: 'user' | 'assistant'; content: string }[];
    location?: { latitude: number; longitude: number };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON body 필요' }, 400);
  }

  const messages = (body.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
  );
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'user 메시지로 끝나는 messages 필요' }, 400);
  }

  try {
    const { places, courses, datasetText } = await loadData();
    const loc =
      body.location &&
      Number.isFinite(body.location.latitude) &&
      Number.isFinite(body.location.longitude)
        ? body.location
        : undefined;

    // 블록 1(고정: 규칙+데이터셋)은 prompt cache 대상 — 5분 내 재요청·동시 사용자 간
    // 공유되어 입력 비용 ~90% 절감 + 첫 토큰 지연 단축. 위치·거리는 가변이라 블록 2로 분리.
    const fixedBlock = `너는 "모토맵"(한국 오토바이 라이더용 지도 앱)의 추천 도우미다.

규칙:
- 아래 데이터셋이 앱에 등록된 장소·코스의 전부다. **반드시 이 안에서만 추천**하고, 목록에 없는 장소·코스를 지어내지 마라. 마땅한 항목이 없으면 없다고 솔직히 말해라.
- 답변은 해요체 2~5문장, 라이더 시점으로 간결하게. 마크다운·이모지 없이. 추천 항목의 이름은 답변에 자연스럽게 언급해라.
- 추천 항목은 recommend 도구의 placeIds/courseIds 에 데이터셋의 id 그대로 담아라 (답변에 언급한 것만).
- 위치 정보 블록이 이어지면 그 거리를 고려해라. "근처"를 물으면 가까운 순으로.
- 라이딩·장소·코스와 무관한 주제(정치, 숙제, 일반 상식 등)는 정중히 거절하고 라이딩 추천으로 화제를 돌려라.

${datasetText}`;

    const variableBlock = loc
      ? buildNearbySummary(places, courses, loc)
      : '사용자 위치: 미제공 (위치 기반 질문이면 지역을 되물어라)';

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: fixedBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: variableBlock },
      ],
      messages: messages.slice(-10),
      tools: [RECOMMEND_TOOL],
      tool_choice: { type: 'tool', name: 'recommend' },
    });

    const toolUse = res.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('구조화 응답 없음');
    const out = toolUse.input as { reply: string; placeIds: string[]; courseIds: string[] };

    // 실존 id 만 카드로 — 모델이 지어낸 id 는 여기서 걸러진다
    const placeMap = new Map(places.map((p) => [p.id, p]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const placeCards = (out.placeIds ?? [])
      .map((id) => placeMap.get(id))
      .filter((p): p is PlaceRow => !!p)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        address: p.address,
        distanceKm: loc ? km(loc.latitude, loc.longitude, p.latitude, p.longitude) : null,
      }));
    const courseCards = (out.courseIds ?? [])
      .map((id) => courseMap.get(id))
      .filter((c): c is CourseRow => !!c)
      .slice(0, 3)
      .map((c) => ({ id: c.id, name: c.name, distance: c.distance, duration: c.duration }));

    // usage 는 캐시 동작·비용 추적용 (클라는 무시)
    return json({
      reply: out.reply ?? '',
      places: placeCards,
      courses: courseCards,
      usage: {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (e) {
    console.error('moto-chat error', e);
    return json({ error: '추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 502);
  }
});

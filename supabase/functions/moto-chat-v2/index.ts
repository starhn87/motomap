// 모토맵 AI 추천 챗 v2 — 등록 장소와 목적지 중심 라이딩 추천 안에서만 답한다.
// 기존 moto-chat의 장소·고정 코스 응답 계약은 구버전 앱을 위해 그대로 유지한다.

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { enforceRateLimits } from '../_shared/rateLimit.ts';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_BODY_BYTES = 32_000;
const MAX_TURNS = 10;
const MAX_USER_CHARS = 1_000;
const MAX_TURN_CHARS = 2_000;
const MAX_HISTORY_CHARS = 12_000;

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

interface GeneralPlaceRow {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface RidingGuideRow {
  id: string;
  title: string;
  summary: string;
  description: string;
  featured_roads: string[] | null;
  regions: string[] | null;
  tags: string[] | null;
}

interface RidingGuideStopRow {
  guide_id: string;
  position: number;
  role: 'primary' | 'stop';
  place_id: string | null;
  general_place_id: string | null;
  note: string | null;
}

interface ResolvedGuide extends RidingGuideRow {
  primary: {
    name: string;
    latitude: number;
    longitude: number;
  };
  stopNames: string[];
}

let cache: {
  places: PlaceRow[];
  guides: ResolvedGuide[];
  datasetText: string;
  exp: number;
} | null = null;

const headers = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` });

async function loadData() {
  if (cache && cache.exp > Date.now()) return cache;

  const [placesRes, guidesRes, stopsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/all_places`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_filter: null }),
    }),
    fetch(
      `${SUPABASE_URL}/rest/v1/riding_guides?published_at=not.is.null&deleted_at=is.null&select=id,title,summary,description,featured_roads,regions,tags`,
      { headers: headers() },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/riding_guide_stops?select=guide_id,position,role,place_id,general_place_id,note&order=position.asc`,
      { headers: headers() },
    ),
  ]);

  if (![placesRes, guidesRes, stopsRes].every((response) => response.ok)) {
    throw new Error(
      `데이터 로드 실패 ${placesRes.status}/${guidesRes.status}/${stopsRes.status}`,
    );
  }

  const places = (await placesRes.json()) as PlaceRow[];
  const guideRows = (await guidesRes.json()) as RidingGuideRow[];
  const stopRows = (await stopsRes.json()) as RidingGuideStopRow[];
  const generalIds = [
    ...new Set(
      stopRows.flatMap((stop) => stop.general_place_id ? [stop.general_place_id] : []),
    ),
  ];
  let generalPlaces: GeneralPlaceRow[] = [];
  if (generalIds.length > 0) {
    const generalRes = await fetch(
      `${SUPABASE_URL}/rest/v1/general_places?id=in.(${generalIds.join(',')})&select=id,name,address,latitude,longitude`,
      { headers: headers() },
    );
    if (!generalRes.ok) throw new Error(`일반 장소 로드 실패 ${generalRes.status}`);
    generalPlaces = (await generalRes.json()) as GeneralPlaceRow[];
  }
  const placeMap = new Map(places.map((place) => [place.id, place]));
  const generalMap = new Map(generalPlaces.map((place) => [place.id, place]));
  const stopsByGuide = new Map<string, RidingGuideStopRow[]>();

  for (const stop of stopRows) {
    const guideStops = stopsByGuide.get(stop.guide_id) ?? [];
    guideStops.push(stop);
    stopsByGuide.set(stop.guide_id, guideStops);
  }

  const guides = guideRows.flatMap((guide): ResolvedGuide[] => {
    const stops = stopsByGuide.get(guide.id) ?? [];
    const resolved = stops.flatMap((stop) => {
      const target = stop.place_id
        ? placeMap.get(stop.place_id)
        : stop.general_place_id
          ? generalMap.get(stop.general_place_id)
          : undefined;
      return target ? [{ stop, target }] : [];
    });
    const primary = resolved.find(({ stop }) => stop.role === 'primary')?.target;
    if (!primary) return [];

    return [{
      ...guide,
      primary: {
        name: primary.name,
        latitude: primary.latitude,
        longitude: primary.longitude,
      },
      stopNames: resolved
        .filter(({ stop }) => stop.role === 'stop')
        .map(({ target }) => target.name),
    }];
  });

  cache = {
    places,
    guides,
    datasetText: buildDataset(places, guides),
    exp: Date.now() + 5 * 60 * 1000,
  };
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

function buildDataset(places: PlaceRow[], guides: ResolvedGuide[]): string {
  const placeLines = places.map((place) => {
    const tags = place.tags?.length ? ` [${place.tags.join(',')}]` : '';
    return `- id:${place.id} | ${place.name} | ${CATEGORY_LABELS[place.category] ?? place.category} | ${place.address}${tags} | ${place.description ?? ''}`;
  });
  const guideLines = guides.map((guide) => {
    const roads = guide.featured_roads?.length ? ` | 추천 도로:${guide.featured_roads.join(',')}` : '';
    const stops = guide.stopNames.length ? ` | 함께 들를 곳:${guide.stopNames.join(',')}` : '';
    const tags = guide.tags?.length ? ` [${guide.tags.join(',')}]` : '';
    return `- id:${guide.id} | ${guide.title}${tags} | 대표 목적지:${guide.primary.name} | 지역:${(guide.regions ?? []).join(',')}${roads}${stops} | ${guide.summary}`;
  });
  return `## 장소 (${places.length}곳)\n${placeLines.join('\n')}\n\n## 라이딩 추천 (${guides.length}개)\n${guideLines.join('\n')}`;
}

function buildNearbySummary(
  places: PlaceRow[],
  guides: ResolvedGuide[],
  location: { latitude: number; longitude: number },
): string {
  const nearestPlaces = places
    .map((place) => ({
      place,
      distance: km(location.latitude, location.longitude, place.latitude, place.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 30)
    .map(({ place, distance }) => `- id:${place.id} | ${place.name} | ${distance}km`);
  const guideDistances = guides
    .map((guide) => ({
      guide,
      distance: km(
        location.latitude,
        location.longitude,
        guide.primary.latitude,
        guide.primary.longitude,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ guide, distance }) =>
      `- id:${guide.id} | ${guide.title} | 대표 목적지 ${guide.primary.name}까지 ${distance}km`
    );

  return `사용자 현재 위치: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}

## 현재 위치에서 가까운 장소 Top 30
${nearestPlaces.join('\n')}

## 라이딩 추천의 대표 목적지까지 거리
${guideDistances.join('\n')}`;
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
      ridingGuideIds: {
        type: 'array',
        items: { type: 'string' },
        description: '추천 라이딩 가이드 id (0~3개, 데이터셋의 id 그대로)',
      },
    },
    required: ['reply', 'placeIds', 'ridingGuideIds'],
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);

  try {
    const limited = await enforceRateLimits(req, [
      { scope: 'moto-chat-v2-burst', limit: 15, windowSeconds: 5 * 60 },
      { scope: 'moto-chat-v2-daily', limit: 100, windowSeconds: 24 * 60 * 60 },
    ]);
    if (limited) return limited;
  } catch (error) {
    console.error('moto-chat-v2 rate limit error', error);
    return json({ error: '추천 서비스를 준비하지 못했습니다.' }, 503);
  }

  let body: {
    messages?: { role: 'user' | 'assistant'; content: string }[];
    location?: { latitude: number; longitude: number };
    bike?: string;
  };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: '대화 내용이 너무 깁니다.' }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON body 필요' }, 400);
  }

  const sourceMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = sourceMessages.slice(-MAX_TURNS).filter(
    (message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0,
  );
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'user 메시지로 끝나는 messages 필요' }, 400);
  }
  if (
    messages.some((message) => message.content.length > MAX_TURN_CHARS) ||
    messages[messages.length - 1].content.length > MAX_USER_CHARS ||
    messages.reduce((sum, message) => sum + message.content.length, 0) > MAX_HISTORY_CHARS
  ) {
    return json({ error: '대화 내용이 너무 깁니다.' }, 413);
  }

  try {
    const { places, guides, datasetText } = await loadData();
    const location =
      body.location &&
      Number.isFinite(body.location.latitude) &&
      Number.isFinite(body.location.longitude)
        ? body.location
        : undefined;

    const fixedBlock = `너는 "모토맵"(한국 오토바이 라이더용 지도 앱)의 추천 도우미다.

규칙:
- 아래 데이터셋이 앱에 공개된 장소와 라이딩 추천의 전부다. 반드시 이 안에서만 추천하고 목록에 없는 대상을 지어내지 마라.
- 라이딩 추천은 고정 경로가 아니다. 대표 목적지, 추천 도로, 함께 들를 곳을 엮은 편집 콘텐츠다. 출발지·거리·예상 시간이나 따라야 할 경로를 지어내지 마라.
- 답변은 해요체 2~5문장, 라이더 시점으로 간결하게. 마크다운·이모지 없이 추천 이름을 자연스럽게 언급해라.
- 추천 항목은 recommend 도구의 placeIds/ridingGuideIds에 데이터셋 id 그대로 담아라. 답변에 언급한 것만 담아라.
- 위치 정보 블록이 이어지면 그 거리를 고려해라. "근처"를 물으면 가까운 순으로 답해라.
- 라이딩과 무관한 주제는 정중히 거절하고 라이딩 추천으로 화제를 돌려라.

${datasetText}`;

    let variableBlock = location
      ? buildNearbySummary(places, guides, location)
      : '사용자 위치: 미제공 (위치 기반 질문이면 지역을 되물어라)';
    const bike = typeof body.bike === 'string' && body.bike.trim()
      ? body.bike.trim().slice(0, 60)
      : null;
    if (bike) {
      variableBlock += `\n\n사용자 바이크: ${bike}
- 확실한 근거가 있을 때만 기종을 반영하고, 근거가 약하면 기종을 언급하지 마라.
- 자동차전용도로 통행 불가는 모든 이륜차에 적용된다. 특정 기종만의 제약처럼 말하지 마라.`;
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: fixedBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: variableBlock },
      ],
      messages,
      tools: [RECOMMEND_TOOL],
      tool_choice: { type: 'tool', name: 'recommend' },
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('구조화 응답 없음');
    const output = toolUse.input as {
      reply: string;
      placeIds: string[];
      ridingGuideIds: string[];
    };
    const placeMap = new Map(places.map((place) => [place.id, place]));
    const guideMap = new Map(guides.map((guide) => [guide.id, guide]));

    const placeCards = (output.placeIds ?? [])
      .map((id) => placeMap.get(id))
      .filter((place): place is PlaceRow => !!place)
      .slice(0, 5)
      .map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
        address: place.address,
        distanceKm: location
          ? km(location.latitude, location.longitude, place.latitude, place.longitude)
          : null,
      }));
    const ridingGuideCards = (output.ridingGuideIds ?? [])
      .map((id) => guideMap.get(id))
      .filter((guide): guide is ResolvedGuide => !!guide)
      .slice(0, 3)
      .map((guide) => ({
        id: guide.id,
        title: guide.title,
        summary: guide.summary,
        regions: guide.regions ?? [],
        primaryPlaceName: guide.primary.name,
        distanceKm: location
          ? km(
              location.latitude,
              location.longitude,
              guide.primary.latitude,
              guide.primary.longitude,
            )
          : null,
      }));

    return json({
      reply: output.reply ?? '',
      places: placeCards,
      ridingGuides: ridingGuideCards,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (error) {
    console.error('moto-chat-v2 error', error);
    return json({ error: '추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 502);
  }
});

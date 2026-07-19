// 코스 전면 재작성 — "구간(길)" 모델 (2026-07-19)
// 세세한 경유지 대신 시작·끝(+방향 고정 최소한의 중간점)으로 좌표를 줄이고,
// 구간 지명(section_from/to)과 도로명(route_name, 확실한 것만)을 부여한다.
// 거리·시간은 네이버 Directions 스냅 실측값으로 기록해 표시값 = 실도로값을 보장한다.
//
// 사용:
//   node scripts/rewrite-course-sections.mjs --verify   # 실측만 출력 (DB 안 건드림)
//   node scripts/rewrite-course-sections.mjs            # 실측 후 DB 갱신

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const VERIFY_ONLY = process.argv.includes('--verify');
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NAVER_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;

// 좌표는 [lng, lat]. 순환 코스는 시작 = 끝.
const COURSES = [
  {
    name: '북한강 라이딩 코스',
    section_from: '양수리',
    section_to: '청평',
    route_name: '북한강로(45번 국도)',
    coordinates: [[127.31, 37.532], [127.37, 37.657], [127.428, 37.736]],
  },
  {
    name: '양평 6번 국도 코스',
    section_from: '팔당',
    section_to: '양평읍',
    route_name: '6번 국도',
    coordinates: [[127.243, 37.527], [127.4, 37.505], [127.489, 37.492]],
  },
  {
    name: '대부도 해안 코스',
    section_from: '방아머리',
    section_to: '탄도항',
    route_name: '대부황금로',
    coordinates: [[126.588, 37.256], [126.552, 37.24], [126.586, 37.19]],
  },
  {
    name: '설악 미시령-한계령 와인딩 코스',
    section_from: '용대리',
    section_to: '한계령',
    route_name: '미시령로, 한계령로',
    coordinates: [[128.203, 38.1233], [128.4372, 38.2142], [128.6086, 38.1632], [128.4065, 38.0974]],
  },
  {
    name: '천안 바이커 카페 투어',
    section_from: '신안동',
    section_to: '원성동',
    route_name: null,
    coordinates: [[127.173, 36.833], [127.143, 36.802], [127.178, 36.812]],
  },
  {
    name: '강화도 일주 코스',
    section_from: '강화대교',
    section_to: '강화대교',
    route_name: '강화일주도로',
    coordinates: [[126.487, 37.747], [126.281, 37.782], [126.349, 37.694], [126.453, 37.613], [126.538, 37.641], [126.487, 37.747]],
  },
  {
    name: '용인-이천 카페 투어',
    section_from: '용인',
    section_to: '이천',
    route_name: '42번 국도',
    coordinates: [[127.099, 37.275], [127.283, 37.238], [127.435, 37.279]],
  },
  {
    name: '파주-양주 북부 코스',
    section_from: '파주',
    section_to: '양주',
    route_name: null,
    coordinates: [[126.887, 37.774], [127.068, 37.821]],
  },
  {
    name: '동해안 7번 국도 헌화로 코스',
    section_from: '정동진',
    section_to: '동해',
    route_name: '헌화로, 7번 국도',
    coordinates: [[128.9483, 37.7723], [129.0538, 37.6659], [129.1599, 37.4792]],
  },
  {
    name: '포천-철원 와인딩 코스',
    section_from: '포천',
    section_to: '철원',
    route_name: '43번 국도',
    coordinates: [[127.162, 37.863], [127.3, 37.95], [127.4, 38.1]],
  },
  {
    name: '지리산 성삼재-정령치 코스',
    section_from: '구례',
    section_to: '남원 주천',
    route_name: '861번 지방도(성삼재로, 정령치로)',
    coordinates: [[127.4763, 35.2739], [127.5223, 35.3638], [127.3798, 35.4039]],
  },
  {
    name: '남해 물미해안도로 코스',
    section_from: '남해대교',
    section_to: '물건리',
    route_name: '물미해안도로',
    coordinates: [[127.872, 34.9443], [127.894, 34.7275], [128.045, 34.7133], [128.0533, 34.7698]],
  },
  {
    name: '제주 일주 코스',
    section_from: '제주공항',
    section_to: '제주공항',
    route_name: '일주서로, 일주동로(1132번)',
    coordinates: [[126.4927, 33.5068], [126.24, 33.39], [126.25, 33.22], [126.42, 33.245], [126.84, 33.32], [126.92, 33.46], [126.4927, 33.5068]],
  },
  {
    name: '변산반도 해안 코스',
    section_from: '새만금',
    section_to: '곰소',
    route_name: '30번 국도(변산해안로)',
    coordinates: [[126.5588, 35.6968], [126.4661, 35.6242], [126.6057, 35.586]],
  },
  {
    name: '하동 섬진강 벚꽃길 코스',
    section_from: '구례',
    section_to: '하동읍',
    route_name: '19번 국도(섬진강대로)',
    coordinates: [[127.462, 35.202], [127.62, 35.19], [127.7451, 35.0624]],
  },
  {
    name: '영남알프스 얼음골-배내골 코스',
    section_from: '언양',
    section_to: '언양',
    route_name: '24번 국도, 배내로',
    coordinates: [[129.0325, 35.621], [128.943, 35.558], [128.98, 35.5], [129.0325, 35.621]],
  },
];

async function snap(coords) {
  let [start, goal] = [coords[0], coords[coords.length - 1]];
  let vias;
  if (Math.abs(start[0] - goal[0]) < 1e-6 && Math.abs(start[1] - goal[1]) < 1e-6) {
    // 순환 코스 — 시작점 그대로면 API 가 거부하므로 100m 오프셋으로 사실상 완주 실측
    goal = [start[0] + 0.001, start[1]];
    vias = coords.slice(1, -1);
  } else {
    vias = coords.slice(1, -1);
  }
  const via = vias.length
    ? `&waypoints=${vias.slice(0, 5).map(([lng, lat]) => `${lng},${lat}`).join('|')}`
    : '';
  const url =
    `https://maps.apigw.ntruss.com/map-direction/v1/driving` +
    `?start=${start[0]},${start[1]}&goal=${goal[0]},${goal[1]}&option=trafast${via}`;
  const res = await fetch(url, {
    headers: { 'x-ncp-apigw-api-key-id': NAVER_ID, 'x-ncp-apigw-api-key': NAVER_SECRET },
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message ?? 'no route');
  const s = data.route.trafast[0].summary;
  return { km: s.distance / 1000, min: s.duration / 60000 };
}

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

for (const c of COURSES) {
  const { km, min } = await snap(c.coordinates);
  const distance = Math.round(km);
  const duration = round5(min);
  console.log(
    `${c.name}: ${c.section_from} → ${c.section_to}` +
      (c.route_name ? ` (${c.route_name})` : '') +
      ` — 실측 ${km.toFixed(1)}km ${min.toFixed(0)}분 → 기록 ${distance}km ${duration}분`,
  );
  if (!VERIFY_ONLY) {
    const res = await fetch(`${BASE}/rest/v1/courses?name=eq.${encodeURIComponent(c.name)}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        coordinates: c.coordinates,
        distance,
        duration,
        section_from: c.section_from,
        section_to: c.section_to,
        route_name: c.route_name,
      }),
    });
    const rows = await res.json();
    if (!res.ok || !rows.length) throw new Error(`${c.name} 갱신 실패: ${JSON.stringify(rows)}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log(VERIFY_ONLY ? '검증 완료 (DB 미변경)' : 'DB 갱신 완료');

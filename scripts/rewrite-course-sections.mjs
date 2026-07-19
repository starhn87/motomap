// 코스 전면 재작성 — "구간(길)" 모델 (2026-07-19)
// 세세한 경유지 대신 시작·끝(+방향 고정 최소한의 중간점)으로 좌표를 줄이고,
// 구간 지명(section_from/to)과 도로명(route_name, 확실한 것만)을 부여한다.
// 거리·시간은 네이버 Directions 스냅 실측값으로 기록해 표시값 = 실도로값을 보장한다.
// 3차(복원): 상세 지도가 실도로 폴리라인 대신 개념 곡선을 그리게 되면서
// 왕복·가지가 표현을 해치지 않으므로, 왕복 정리로 깎았던 경유(구봉도·창후리·
// 얼음골 대순환 등)를 전부 되살렸다. 거리·시간은 계속 스냅 실측값.
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
    description:
      '울주 석남사에서 24번 국도로 석남터널을 넘어 밀양 얼음골로 내려가는 영남알프스 코스예요. 터널을 지나면 급커브 내리막이 이어지니 속도를 줄여 달리는 게 좋아요. 표충사와 밀양댐 호반을 지나 배내골 계곡길을 거슬러 배내고개까지 올라요. 부산과 경남 라이더들이 즐겨 찾는 근교 명소예요.',
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
  return { km: s.distance / 1000, min: s.duration / 60000, path: data.route.trafast[0].path };
}

// Douglas-Peucker 단순화 — 실도로의 굵은 형상만 남긴 표시용 경로를 만든다.
// 허용오차를 코스 스팬에 비례시켜 큰 코스든 작은 코스든 비슷한 밀도가 되게 한다.
function simplify(points, eps) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  let dmax = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    let d;
    if (dx === 0 && dy === 0) {
      d = Math.hypot(px - ax, py - ay);
    } else {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax > eps) {
    const left = simplify(points.slice(0, idx + 1), eps);
    const right = simplify(points.slice(idx), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function displayGeometry(path) {
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return simplify(path, span * 0.006).map(([lng, lat]) => [
    Number(lng.toFixed(5)),
    Number(lat.toFixed(5)),
  ]);
}

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

for (const c of COURSES) {
  const { km, min, path } = await snap(c.coordinates);
  const distance = Math.round(km);
  const duration = round5(min);
  const geometry = displayGeometry(path);
  console.log(
    `${c.name}: ${c.section_from} → ${c.section_to}` +
      (c.route_name ? ` (${c.route_name})` : '') +
      ` — 실측 ${km.toFixed(1)}km ${min.toFixed(0)}분, 표시 경로 ${geometry.length}점`,
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
        route_geometry: geometry,
        ...(c.rename ? { name: c.rename } : {}),
        ...(c.description ? { description: c.description } : {}),
      }),
    });
    const rows = await res.json();
    if (!res.ok || !rows.length) throw new Error(`${c.name} 갱신 실패: ${JSON.stringify(rows)}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log(VERIFY_ONLY ? '검증 완료 (DB 미변경)' : 'DB 갱신 완료');

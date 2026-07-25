// 코스의 거리·소요시간·표시 경로를 이륜차 기준으로 다시 계산한다.
// 기존 값은 네이버 trafast(자동차 전용도로 포함)로 뽑은 것이라 라이더가 실제로
// 갈 수 없는 길과 그만큼 짧은 시간이 저장돼 있었다. traavoidcaronly 로 다시 잰다.
// coordinates(코스 정의)는 손대지 않고 DB 값을 그대로 읽어 쓴다.
//
// 사용: node scripts/recalc-course-routes.mjs [--dry]
import { readFileSync } from 'node:fs';

function loadEnv() {
  const content = readFileSync('.env', 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NAVER_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;
const DRY = process.argv.includes('--dry');

const OPTION = 'traavoidcaronly';

async function api(path, options = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 실도로 스냅 — 경유지는 네이버 제한(5개)까지만
async function snap(coords) {
  const start = coords[0];
  let goal = coords[coords.length - 1];
  // 순환 코스는 시작=끝이면 API 가 거부하므로 살짝 어긋나게 둔다
  if (start[0] === goal[0] && start[1] === goal[1]) goal = [goal[0] + 0.001, goal[1]];
  const mid = coords.slice(1, -1).slice(0, 5);
  const via = mid.length ? `&waypoints=${mid.map((c) => `${c[0]},${c[1]}`).join('|')}` : '';
  const url =
    `https://maps.apigw.ntruss.com/map-direction/v1/driving` +
    `?start=${start[0]},${start[1]}&goal=${goal[0]},${goal[1]}&option=${OPTION}${via}`;
  const res = await fetch(url, {
    headers: { 'x-ncp-apigw-api-key-id': NAVER_ID, 'x-ncp-apigw-api-key': NAVER_SECRET },
  });
  const data = await res.json();
  const route = data.route?.[OPTION]?.[0];
  if (!route) throw new Error(data.message ?? `경로 실패 (code ${data.code})`);
  return {
    km: route.summary.distance / 1000,
    min: route.summary.duration / 60000,
    path: route.path,
  };
}

// Douglas-Peucker — rewrite-course-sections.mjs 와 같은 구현.
// 점과 "선분"의 거리를 t 클램프로 재고, 시작=끝(순환 코스)을 따로 다룬다.
// 무한 직선 공식으로 대충 쓰면 순환 코스에서 모든 점이 0 거리로 판정돼
// 경로가 직선 2점으로 뭉개진다.
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
  const lats = path.map((p) => p[1]);
  const lngs = path.map((p) => p[0]);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
  const simplified = simplify(path, span * 0.006);
  return simplified.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
}

const courses = await api('courses?select=id,name,coordinates,distance,duration&approved=eq.true');
console.log(`코스 ${courses.length}개를 이륜차 기준(${OPTION})으로 다시 잽니다.\n`);

for (const c of courses) {
  try {
    const { km, min, path } = await snap(c.coordinates);
    const distance = Number(km.toFixed(1));
    const duration = Math.round(min / 5) * 5;
    const geometry = displayGeometry(path);
    const mark = duration !== c.duration ? `(${duration > c.duration ? '+' : ''}${duration - c.duration}분)` : '(변화 없음)';
    console.log(
      `${c.name.slice(0, 24).padEnd(26)} ${String(c.duration).padStart(3)}분 ${c.distance.toFixed(0).padStart(3)}km → ` +
        `${String(duration).padStart(3)}분 ${distance.toFixed(0).padStart(3)}km  ${mark}  점 ${geometry.length}개`
    );
    if (!DRY) {
      await api(`courses?id=eq.${c.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ distance, duration, route_geometry: geometry }),
      });
    }
  } catch (e) {
    console.log(`${c.name.slice(0, 24).padEnd(26)} 실패: ${e.message}`);
  }
}

console.log(DRY ? '\n--dry 모드 — 반영하지 않았습니다.' : '\n반영 완료.');

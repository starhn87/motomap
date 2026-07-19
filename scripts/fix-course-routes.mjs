// 시드 코스 동선 교정 — 네이버 Directions 실측(2026-07-19)에서 waypoint 가 실도로와
// 크게 어긋난 4개 코스의 좌표를 실제 라이더 루트로 바로잡고, 거리·시간도 스냅
// 실측값으로 정정한다. (등록값과 스냅값이 다르면 왕복 추정 신뢰도가 깨진다)
//
// 사용: node scripts/fix-course-routes.mjs   (.env 의 SUPABASE_SERVICE_ROLE_KEY 사용)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error('.env 에 SUPABASE URL/SERVICE_ROLE_KEY 가 필요합니다');

// 실측 근거: 북한강 62.7km 77분(서안 경춘로 미사→팔당→대성리→청평),
// 양평 41.8km 44분(6번 국도), 대부도 15.7km 31분(방아머리→구봉도→탄도항 일주),
// 용인-이천 42.5km 67분(42번 국도)
const FIXES = [
  {
    name: '북한강 라이딩 코스',
    coordinates: [[127.15, 37.52], [127.243, 37.527], [127.37, 37.657], [127.41, 37.7], [127.428, 37.736]],
    distance: 63,
    duration: 75,
  },
  {
    name: '양평 6번 국도 코스',
    coordinates: [[127.148, 37.52], [127.243, 37.527], [127.31, 37.532], [127.4, 37.505], [127.489, 37.492]],
    distance: 42,
    duration: 45,
  },
  {
    name: '대부도 해안 코스',
    coordinates: [[126.588, 37.256], [126.552, 37.24], [126.558, 37.205], [126.586, 37.19], [126.588, 37.256]],
    distance: 16,
    duration: 30,
  },
  {
    name: '용인-이천 카페 투어',
    coordinates: [[127.099, 37.275], [127.201, 37.234], [127.283, 37.238], [127.36, 37.258], [127.435, 37.279]],
    distance: 43,
    duration: 65,
  },
];

for (const { name, ...patch } of FIXES) {
  const res = await fetch(`${BASE}/rest/v1/courses?name=eq.${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const rows = await res.json();
  if (!res.ok || !rows.length) throw new Error(`${name} 갱신 실패: ${JSON.stringify(rows)}`);
  console.log(`${name}: ${rows[0].distance}km ${rows[0].duration}분으로 갱신`);
}
console.log('완료');

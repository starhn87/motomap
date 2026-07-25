// 장소 주소의 시도 표기를 축약형으로 통일한다.
// 시드 데이터는 정식형("강원특별자치도"), 카카오 로컬은 축약형("강원")을 주는 탓에
// 같은 지역이 두 이름으로 갈려 검색 결과에 섞여 보이고 지역 필터도 못 만든다.
// 앞으로 들어올 제보가 카카오 경유라 축약형이 기준이 된다.
//
// 사용: node scripts/normalize-addresses.mjs [--dry]
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
const DRY = process.argv.includes('--dry');

// 정식 표기 → 축약 표기
const SIDO = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주도: '제주',
  제주특별자치도: '제주',
};

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

const places = await api('places?select=id,name,address');
const updates = [];

for (const p of places) {
  const address = p.address ?? '';
  const head = address.split(' ')[0];
  const short = SIDO[head];
  if (!short) continue;
  updates.push({ id: p.id, name: p.name, from: address, to: `${short}${address.slice(head.length)}` });
}

console.log(`장소 ${places.length}곳 중 ${updates.length}곳의 시도 표기를 축약형으로 통일합니다.`);
for (const u of updates.slice(0, 5)) console.log(`  ${u.from}  →  ${u.to}`);
if (updates.length > 5) console.log(`  … 외 ${updates.length - 5}곳`);

if (DRY) {
  console.log('\n--dry 모드 — 반영하지 않았습니다.');
} else {
  for (const u of updates) {
    await api(`places?id=eq.${u.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ address: u.to }),
    });
  }
  console.log(`\n${updates.length}곳 반영 완료.`);
}

// 반영 후 분포 확인
const after = await api('places?select=address');
const dist = {};
for (const p of after) {
  const head = (p.address ?? '').split(' ')[0];
  dist[head] = (dist[head] ?? 0) + 1;
}
console.log('\n시도별 분포:');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}

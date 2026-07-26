// 전화번호가 비어 있는 등록 장소를 카카오 로컬에서 찾아 채운다.
// 이름으로 검색한 뒤 좌표가 150m 안에 있는 결과만 같은 곳으로 인정한다
// (이름만 같고 다른 지점인 프랜차이즈를 잘못 붙이지 않기 위함).
// 이름이 많이 다르면 건너뛰고 로그에 남긴다 — 조용히 틀린 번호를 넣는 것보다 낫다.
//
// 사용: node scripts/backfill-phones.mjs [--dry]
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

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const DRY = process.argv.includes('--dry');

const MATCH_RADIUS_M = 150;

async function api(path, options = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function metersBetween(a, b) {
  const R = 6371e3;
  const rad = (d) => (d * Math.PI) / 180;
  const dPhi = rad(b.lat - a.lat);
  const dLambda = rad(b.lng - a.lng);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// 띄어쓰기·괄호·지점명 표기 차이를 걷어낸 비교용 이름
const normalize = (name) =>
  (name ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s·・,.'"-]/g, '');

// 정규화 후 같은 이름이면 반경 안 어디든 인정한다.
// 한쪽이 다른 쪽을 품기만 하는 경우(지점명이 붙었거나, 관광지 이름을 딴 옆 가게)는
// 아주 가까울 때만 인정한다 — "두물머리"에 93m 떨어진 "두물머리연핫도그" 번호가
// 붙는 사고를 이 규칙으로 걸렀다.
const NEAR_FOR_PARTIAL_M = 50;

function nameLooksSame(a, b, meters) {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return true;
  return (x.includes(y) || y.includes(x)) && meters <= NEAR_FOR_PARTIAL_M;
}

async function findOnKakao(place) {
  const url =
    `https://dapi.kakao.com/v2/local/search/keyword.json` +
    `?query=${encodeURIComponent(place.name)}&x=${place.longitude}&y=${place.latitude}` +
    `&radius=1000&size=5`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!res.ok) throw new Error(`카카오 ${res.status}`);
  const docs = (await res.json()).documents ?? [];

  return docs
    .map((d) => ({
      doc: d,
      meters: metersBetween(
        { lat: place.latitude, lng: place.longitude },
        { lat: Number(d.y), lng: Number(d.x) }
      ),
    }))
    .filter((c) => c.meters <= MATCH_RADIUS_M)
    .sort((a, b) => a.meters - b.meters)[0];
}

const places = await api('places?select=id,name,phone,address&approved=eq.true&deleted_at=is.null');
const targets = places.filter((p) => !p.phone);
console.log(`승인 장소 ${places.length}곳 중 전화번호 없는 ${targets.length}곳을 확인합니다.\n`);

// RPC 로 좌표를 함께 받는다 (places 테이블의 location 은 PostGIS 타입이라 REST 로는 못 읽음)
const withCoords = await api('rpc/all_places', {
  method: 'POST',
  body: JSON.stringify({ category_filter: null }),
});
const coordsById = new Map(withCoords.map((p) => [p.id, p]));

const updates = [];
const skipped = [];

for (const target of targets) {
  const full = coordsById.get(target.id);
  if (!full) continue;
  try {
    const match = await findOnKakao(full);
    if (!match) {
      skipped.push([target.name, '카카오에 근처 동일 장소 없음']);
      continue;
    }
    if (!match.doc.phone) {
      skipped.push([target.name, `번호 없음 (${match.doc.place_name})`]);
      continue;
    }
    if (!nameLooksSame(target.name, match.doc.place_name, match.meters)) {
      skipped.push([
        target.name,
        `이름이 달라 보류 → "${match.doc.place_name}" (${Math.round(match.meters)}m)`,
      ]);
      continue;
    }
    updates.push({
      id: target.id,
      name: target.name,
      phone: match.doc.phone,
      matched: match.doc.place_name,
      meters: Math.round(match.meters),
    });
  } catch (e) {
    skipped.push([target.name, String(e.message)]);
  }
}

console.log(`채울 수 있는 곳 ${updates.length}곳:`);
for (const u of updates) {
  const via = u.name === u.matched ? '' : `  (카카오: ${u.matched})`;
  console.log(`  ${u.name.padEnd(22)} ${u.phone.padEnd(14)} ${u.meters}m${via}`);
}

if (skipped.length) {
  console.log(`\n건너뛴 곳 ${skipped.length}곳:`);
  for (const [name, why] of skipped) console.log(`  ${name.padEnd(22)} ${why}`);
}

if (DRY) {
  console.log('\n--dry 모드 — 반영하지 않았습니다.');
} else {
  for (const u of updates) {
    await api(`places?id=eq.${u.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ phone: u.phone }),
    });
  }
  console.log(`\n${updates.length}곳 반영 완료.`);
}

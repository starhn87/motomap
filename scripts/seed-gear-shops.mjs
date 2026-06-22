// 바이크 용품점 시드 스크립트 (Supabase REST API, 외부 의존성 없음)
//
// 실행: node scripts/seed-gear-shops.mjs
//
// 필요 환경변수 (.env):
//   EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   EXPO_PUBLIC_NAVER_CLIENT_ID
//   EXPO_PUBLIC_NAVER_CLIENT_SECRET
//   ADMIN_USER_ID                    (선택: submitted_by에 넣을 Supabase 유저 UUID)

import { readFileSync } from 'node:fs';

function loadEnv() {
  try {
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
  } catch {
    // .env 없으면 process.env에서만 읽기
  }
}

loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NAVER_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || null;

if (!SUPABASE_URL || !SERVICE_KEY || !NAVER_ID || !NAVER_SECRET) {
  console.error('[ERROR] 필수 환경변수 누락');
  console.error('  EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,');
  console.error('  EXPO_PUBLIC_NAVER_CLIENT_ID, EXPO_PUBLIC_NAVER_CLIENT_SECRET');
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const GEAR_SHOPS = [
  {
    name: 'NTBmoto',
    address: '서울 마포구 월드컵로23길 8',
    tags: ['용품점', '서울'],
  },
  {
    name: '바이크팝',
    address: '경기 김포시 대곶면 대곶서로234번길 25',
    tags: ['용품점', '김포'],
  },
  {
    name: '바이크마트 서울점',
    address: '서울 중랑구 용마산로 551',
    tags: ['용품점', '서울'],
  },
  {
    name: '와우모터스',
    address: '서울 강동구 천호옛길 17',
    tags: ['용품점', '서울'],
  },
];

async function geocode(address) {
  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': NAVER_ID,
      'x-ncp-apigw-api-key': NAVER_SECRET,
    },
  });
  const data = await res.json();
  const first = data.addresses?.[0];
  if (!first) throw new Error(`지오코딩 결과 없음 (status=${data.status ?? 'unknown'}, msg=${data.errorMessage ?? ''})`);
  return {
    longitude: Number(first.x),
    latitude: Number(first.y),
    matched: first.roadAddress || first.jibunAddress || address,
  };
}

async function alreadyExists(name, address) {
  const params = new URLSearchParams({
    select: 'id',
    name: `eq.${name}`,
    address: `eq.${address}`,
    limit: '1',
  });
  const res = await fetch(`${REST}/places?${params}`, { headers: SUPA_HEADERS });
  if (!res.ok) throw new Error(`조회 실패 ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows.length > 0;
}

async function insertPlace(shop, lat, lng) {
  const payload = {
    name: shop.name,
    description: shop.description ?? '',
    category: 'gear_shop',
    location: `POINT(${lng} ${lat})`,
    address: shop.address,
    phone: shop.phone ?? null,
    tags: shop.tags ?? [],
    opening_hours: shop.openingHours ?? null,
    parking_info: shop.parkingInfo ?? null,
    approved: true,
  };
  if (ADMIN_USER_ID) payload.submitted_by = ADMIN_USER_ID;

  const res = await fetch(`${REST}/places`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`INSERT 실패 ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log(`[INFO] ${GEAR_SHOPS.length}곳 시드 시작\n`);
  let ok = 0, skip = 0, fail = 0;

  for (const shop of GEAR_SHOPS) {
    try {
      if (await alreadyExists(shop.name, shop.address)) {
        console.log(`[SKIP] ${shop.name}`);
        skip++;
        continue;
      }
      const { latitude, longitude, matched } = await geocode(shop.address);
      await insertPlace(shop, latitude, longitude);
      console.log(`[OK]   ${shop.name}  (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
      console.log(`       -> ${matched}`);
      ok++;
    } catch (e) {
      console.error(`[FAIL] ${shop.name}: ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n[DONE] 성공 ${ok} / 중복 ${skip} / 실패 ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});

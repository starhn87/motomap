// JSON 데이터 파일 기반 장소 시드 (범용)
//
// 실행: node scripts/seed-places-from-json.mjs scripts/data/<파일>.json
// 데이터 형식: [{ name, category, address, lat, lng, description, tags }]
//
// - 좌표는 사전 검증된 값을 그대로 사용 (지오코딩 없음)
// - 이름 중복은 SKIP, approved=true 로 삽입 (알림 트리거는 approved=false 에만 발동)
//
// 필요 환경변수 (.env): EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
const DATA_PATH = process.argv[2];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[ERROR] 필수 환경변수 누락: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!DATA_PATH) {
  console.error('[ERROR] 사용법: node scripts/seed-places-from-json.mjs <데이터.json>');
  process.exit(1);
}

const PLACES = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const REST = `${SUPABASE_URL}/rest/v1`;
const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function alreadyExists(name) {
  const params = new URLSearchParams({ select: 'id', name: `eq.${name}`, limit: '1' });
  const res = await fetch(`${REST}/places?${params}`, { headers: SUPA_HEADERS });
  if (!res.ok) throw new Error(`조회 실패 ${res.status}: ${await res.text()}`);
  return (await res.json()).length > 0;
}

async function main() {
  console.log(`[INFO] ${DATA_PATH} — ${PLACES.length}곳 시드 시작`);
  let ok = 0, skip = 0, fail = 0;

  for (const p of PLACES) {
    try {
      if (!p.name || !p.category || !p.lat || !p.lng) throw new Error('필수 필드 누락');
      if (await alreadyExists(p.name)) {
        console.log(`[SKIP] ${p.name}`);
        skip++;
        continue;
      }
      const res = await fetch(`${REST}/places`, {
        method: 'POST',
        headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({
          name: p.name,
          description: p.description ?? '',
          category: p.category,
          location: `POINT(${p.lng} ${p.lat})`,
          address: p.address ?? '',
          tags: p.tags ?? [],
          approved: true,
        }),
      });
      if (!res.ok) throw new Error(`INSERT 실패 ${res.status}: ${await res.text()}`);
      console.log(`[OK]   [${p.category}] ${p.name}`);
      ok++;
    } catch (e) {
      console.error(`[FAIL] ${p.name}: ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 130));
  }

  console.log(`\n[DONE] 성공 ${ok} / 중복 ${skip} / 실패 ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});

// 1) 중복 2건 삭제  2) 태그 '바이커카페' → '바이크카페' 통일
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const DUPLICATE_IDS = [
  'f4ae8fea-6380-4feb-841f-ba248155996a', // 카페모토라드 합천 (기존)
  '892e195e-4d31-45be-ad40-cdac9e9a30e8', // 할리우드 카페 (기존)
];

// 1) 중복 삭제
console.log('[1] 중복 2건 삭제');
for (const id of DUPLICATE_IDS) {
  const res = await fetch(`${URL}/rest/v1/places?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=representation' },
  });
  if (!res.ok) {
    console.error(`  [FAIL] ${id}: ${res.status} ${await res.text()}`);
    continue;
  }
  const deleted = await res.json();
  console.log(`  [OK]   ${id} -> ${deleted[0]?.name ?? '(no row)'}`);
}

// 2) 태그 정규화: 바이커카페 → 바이크카페
console.log('\n[2] 태그 정규화: 바이커카페 → 바이크카페');
const listRes = await fetch(
  `${URL}/rest/v1/places?select=id,name,tags&tags=cs.{바이커카페}`,
  { headers: H }
);
if (!listRes.ok) { console.error(listRes.status, await listRes.text()); process.exit(1); }
const targets = await listRes.json();
console.log(`  대상 ${targets.length}곳`);

let ok = 0, fail = 0;
for (const row of targets) {
  const newTags = (row.tags ?? []).map(t => (t === '바이커카페' ? '바이크카페' : t));
  const res = await fetch(`${URL}/rest/v1/places?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ tags: newTags }),
  });
  if (res.ok) {
    console.log(`  [OK]   ${row.name}: [${row.tags.join(', ')}] -> [${newTags.join(', ')}]`);
    ok++;
  } else {
    console.error(`  [FAIL] ${row.name}: ${res.status} ${await res.text()}`);
    fail++;
  }
}
console.log(`\n[DONE] 태그 업데이트 성공 ${ok} / 실패 ${fail}`);

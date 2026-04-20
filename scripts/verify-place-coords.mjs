// 앱이 실제로 쓰는 RPC로 장소 가져와서 name/lat/lng 확인
import { readFileSync } from 'node:fs';

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

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// 앱이 쓰는 RPC
const res = await fetch(`${URL}/rest/v1/rpc/all_places`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ category_filter: null }),
});
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
const places = await res.json();

console.log(`총 ${places.length}곳\n`);
console.log('name | latitude | longitude | address');
console.log('---');
for (const p of places.slice(0, 5)) {
  console.log(`${p.name} | ${p.latitude} | ${p.longitude} | ${p.address}`);
}

console.log('\n[좌표 빠진 항목]');
const missing = places.filter(p => !p.latitude || !p.longitude);
if (missing.length === 0) {
  console.log('없음 ✓');
} else {
  for (const p of missing) {
    console.log(`  ${p.name} (${p.id}): lat=${p.latitude}, lng=${p.longitude}`);
  }
}

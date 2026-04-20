// DB places 전체 조회 (바이크 관련성 검토용)
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

const params = new URLSearchParams({
  select: 'id,name,category,address,tags,approved,submitted_by,created_at,description',
  order: 'created_at.asc',
});

const res = await fetch(`${URL}/rest/v1/places?${params}`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
const rows = await res.json();

console.log(`총 ${rows.length}개 장소\n`);

const byCategory = {};
for (const r of rows) {
  (byCategory[r.category] ??= []).push(r);
}

for (const [cat, list] of Object.entries(byCategory)) {
  console.log(`\n=== ${cat} (${list.length}개) ===`);
  for (const r of list) {
    const approved = r.approved ? '[승인]' : '[대기]';
    const tags = (r.tags ?? []).join(', ');
    console.log(`${approved} ${r.name}`);
    console.log(`  주소: ${r.address}`);
    if (r.description) console.log(`  설명: ${r.description.slice(0, 80)}${r.description.length > 80 ? '...' : ''}`);
    if (tags) console.log(`  태그: ${tags}`);
    console.log(`  id:   ${r.id}`);
  }
}

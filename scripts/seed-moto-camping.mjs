// 모토캠핑 시드: camping 카테고리 7곳 (경기·강원 2·세종·전북·경남·제주)
//
// 실행: node scripts/seed-moto-camping.mjs
// 전제: 마이그레이션 011(places_category_check에 camping 추가)이 적용돼 있어야 한다.
//
// - 좌표는 카카오 로컬로 사전 검증한 값을 인라인
// - approved=true 로 삽입 — 디스코드/AI 판정 트리거는 approved=false 에만 발동
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[ERROR] 필수 환경변수 누락: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// 모토캠핑 근거(라이더 후기·행사 이력) 확인 + 카카오 지오코딩 검증 완료 (2026-07)
const CAMPINGS = [
  {
    name: '자라섬 캠핑장',
    address: '경기도 가평군 가평읍 자라섬로 60',
    lat: 37.8208748845652, lng: 127.520924550024,
    description: '북한강 자라섬 안에 있는 가평군 공영 캠핑장이에요. 차량이 사이트 옆까지 들어가는 오토캠핑존이라 바이크 진입과 주차가 수월하고 모토캠핑 후기도 꾸준히 올라와요. 가평 북한강변 라이딩과 묶어 1박 일정 짜기 좋아요.',
    tags: ['모토캠핑', '가평', '자라섬', '오토캠핑'],
  },
  {
    name: '높은터캠핑장',
    address: '강원특별자치도 홍천군 홍천읍 높은터로 235',
    lat: 37.6483462737702, lng: 127.845764469818,
    description: '홍천 산자락에 계단식으로 앉힌 사이트라 자리마다 독립감이 있는 캠핑장이에요. 데크와 파쇄석 사이트에 입구 쪽 계곡도 끼고 있어 스쿠터 모토캠퍼도 다녀가요. 홍천강 일대 라이딩과 엮어 하룻밤 보내기 좋아요.',
    tags: ['모토캠핑', '홍천', '계곡'],
  },
  {
    name: '무릉계곡 힐링캠프장',
    address: '강원특별자치도 동해시 삼화로 467',
    lat: 37.4643979848251, lng: 129.026555262453,
    description: '두타산 무릉계곡 초입에 자리한 동해시 공영 캠핑장이에요. 데크 사이트에 취사장과 샤워장을 갖춰 짐이 단출한 모토캠핑도 무리가 없어요. 동해안 7번 국도나 백복령 고갯길 라이딩에 하룻밤 끼워 넣기 좋아요.',
    tags: ['모토캠핑', '동해', '무릉계곡'],
  },
  {
    name: '합강캠핑장',
    address: '세종특별자치시 연기면 태산로 329',
    lat: 36.515309997391554, lng: 127.33307243653775,
    description: '금강과 미호강이 만나는 합수부에 있는 세종시 공영 캠핑장이에요. 강변을 따라 오토캠핑존 101면이 펼쳐져 바이크를 사이트 옆에 세우기 편해요. 금강변 라이딩을 마무리하는 1박 거점으로 좋아요.',
    tags: ['모토캠핑', '세종', '금강'],
  },
  {
    name: '덕유대야영장',
    address: '전북특별자치도 무주군 설천면 백련사길 2',
    lat: 35.8912454242182, lng: 127.777790822534,
    description: '덕유산국립공원 구천동 계곡 옆에 있는 국립공원 최대 규모 야영장이에요. 무주에서 혼다데이가 열리는 시즌이면 모토캠퍼들이 모여들어요. 자동차야영지는 사이트까지 바이크 진입이 가능하고 예약은 국립공원 예약시스템 선예약제예요.',
    tags: ['모토캠핑', '무주', '덕유산', '국립공원'],
  },
  {
    name: '산여울캠핑장',
    address: '경상남도 밀양시 산외면 밀양대로 3480',
    lat: 35.5430306675552, lng: 128.856674221746,
    description: '밀양 산외면 밀양대로 변에 있어 바이크로 접근하기 쉬운 사설 캠핑장이에요. 경남 내륙 모토캠퍼들의 후기에 등장하는 곳이에요. 얼음골과 표충사 방면 라이딩과 엮어 1박 일정 짜기 좋아요.',
    tags: ['모토캠핑', '밀양'],
  },
  {
    name: '모구리야영장',
    address: '제주특별자치도 서귀포시 성산읍 서성일로 260',
    lat: 33.4066281682593, lng: 126.822158983854,
    description: '성산 모구리오름 자락에 있는 서귀포시 공영 야영장이에요. 잔디 영지 곳곳에 전기 배전함이 있고 이용료도 저렴한 편이라 제주 일주 모토캠퍼들의 후기에 꾸준히 등장해요. 성산일출봉과 섭지코지 등 동부 해안 라이딩 거점으로 좋아요.',
    tags: ['모토캠핑', '제주', '성산'],
  },
];

async function alreadyExists(name) {
  const params = new URLSearchParams({ select: 'id', name: `eq.${name}`, limit: '1' });
  const res = await fetch(`${REST}/places?${params}`, { headers: SUPA_HEADERS });
  if (!res.ok) throw new Error(`조회 실패 ${res.status}: ${await res.text()}`);
  return (await res.json()).length > 0;
}

async function main() {
  console.log(`[INFO] 모토캠핑 ${CAMPINGS.length}곳 시드 시작`);
  let ok = 0, skip = 0, fail = 0;

  for (const p of CAMPINGS) {
    try {
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
          description: p.description,
          category: 'camping',
          location: `POINT(${p.lng} ${p.lat})`,
          address: p.address,
          tags: p.tags,
          approved: true,
        }),
      });
      if (!res.ok) throw new Error(`INSERT 실패 ${res.status}: ${await res.text()}`);
      console.log(`[OK]   ${p.name}  (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`);
      ok++;
    } catch (e) {
      console.error(`[FAIL] ${p.name}: ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n[DONE] 성공 ${ok} / 중복 ${skip} / 실패 ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});

// 바이크 카페 시드 스크립트 (Supabase REST API, 외부 의존성 없음)
//
// 실행: node scripts/seed-bike-cafes.mjs
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

// 15곳 — 검증된 후보. 제외: 어반스캠프/루트플랜트 (상세 주소 미확인)
const BIKE_CAFES = [
  {
    name: '카페 모토라드 합천',
    address: '경남 합천군 대병면 합천호수로 525',
    phone: '0507-1388-8883',
    description: 'BMW 모토라드 프리미엄 바이크 문화체험 공간. 2층 북카페, 갤러리, 루프탑.',
    openingHours: '수~일 10:00-18:00 (월·화 휴무)',
    parkingInfo: '모터사이클 전용 주차장, 라이딩 기어 건조기',
    tags: ['바이크카페', '모토라드', 'BMW', '바이크전시', '헬멧보관'],
  },
  {
    name: '바이크루 원주점',
    address: '강원 원주시 판부면 치악로 968',
    phone: '0507-1418-1308',
    description: '치악산 자락, 5번 국도변 라이더 카페.',
    openingHours: '화~일 12:30-20:00 (월 휴무)',
    tags: ['바이크카페', '5번국도', '치악산'],
  },
  {
    name: '네이버후드',
    address: '경기 파주시 월롱면 홀작로 70-4',
    phone: '031-941-8185',
    description: '2층 50평 규모. 캠핑 분위기 야외 데크, 1층 셀프 스낵바. 월롱역에서 약 5km.',
    tags: ['바이크카페', '캠핑분위기', '야외데크'],
  },
  {
    name: '할리우드',
    address: '충남 천안시 동남구 유량로 185',
    phone: '0507-1309-1675',
    description: '미국 감성 그래피티 외관, 야간 조명이 돋보이는 라이더 핫플.',
    openingHours: '월-금 11:00-02:00 / 토 10:00-02:00 / 일 10:00-24:00 (우천 휴무)',
    tags: ['바이크카페', '야간라이딩', '그래피티', '천안'],
  },
  {
    name: '올드타운로드',
    address: '경기 용인시 기흥구 신정로 185',
    description: '네온사인 간판이 인상적인 심야 라이더 카페. 아이스크림 유명.',
    openingHours: '매일 10:00-02:00',
    parkingInfo: '전면 바이크 주차, 후면 자동차 주차장',
    tags: ['바이크카페', '심야영업', '용인'],
  },
  {
    name: '카페 리미트',
    address: '경기 이천시 부발읍 두무재로 83 1층',
    description: '스포츠/레플리카 바이크 테마. 직접 로스팅하는 로스터리.',
    tags: ['바이크카페', '스포츠바이크', '로스터리'],
  },
  {
    name: '돈키호테 1988',
    address: '경남 밀양시 삼랑진읍 천태로 98 102호',
    description: '삼랑진 만남의 광장 "삼만장". 공기압 컴프레서, 세차용품, 공구, 쉴드 클리너 제공.',
    openingHours: '매일 10:00- (월 휴무)',
    tags: ['바이크카페', '정비지원', '세차', '밀양'],
  },
  {
    name: '비엔비(B&B)',
    address: '부산 강서구 강동동 2279',
    description: '부산 라이더들의 휴식처. 커피와 라면.',
    tags: ['바이크카페', '부산'],
  },
  {
    name: '모토매니아카페',
    address: '울산 울주군 서생면 나사해안길 155',
    description: '경남권 최대 바이크 테마 초대형 카페. 국내 5대뿐인 바이크 체험 가능.',
    openingHours: '매일 12:00-24:00',
    tags: ['바이크카페', '바이크체험', '울산', '대형카페'],
  },
  {
    name: '두바퀴',
    address: '경기 안산시 단원구 대부해안로 34',
    description: '대부도 외곽 한적한 위치. 무인 라면 기계·음료 자판기로 24시간 이용 가능.',
    tags: ['바이크카페', '대부도', '24시간무인', '바이크시승'],
  },
  {
    name: '카페 M.C',
    address: '인천 강화군 송해면 강화대로 701',
    description: '강화도 라이더 카페. 떡라면, 토스트, 핫도그 등 4천원대 식사 가능.',
    tags: ['바이크카페', '강화도', '식사가능'],
  },
  {
    name: '뱅어스',
    address: '경기 성남시 수정구 대왕판교로 966',
    description: '심플 감각 인테리어. 저렴한 아메리카노(3,600원).',
    openingHours: '매일 18:00-24:00 (우천 휴무)',
    tags: ['바이크카페', '야간영업', '판교'],
  },
  {
    name: '귀산라이더카페 브룸',
    address: '경남 창원시 성산구 삼귀로 373-3',
    description: '마창대교 근처 귀산 카페거리 라이더 카페.',
    openingHours: '매일 14:00-01:00 (LO 24:00)',
    tags: ['바이크카페', '창원', '귀산'],
  },
  {
    name: '카페 모토라드 이천',
    address: '경기도 이천시 호법면 프리미엄아울렛로 177-74',
    description: 'BMW 모토라드 1호점. 롯데 프리미엄아울렛 내 위치.',
    tags: ['바이크카페', '모토라드', 'BMW', '이천'],
  },
  {
    name: '카페 모토라드 성남',
    address: '경기 성남시 분당구 궁내동',
    description: 'BMW 모토라드 성남점. 3호점.',
    tags: ['바이크카페', '모토라드', 'BMW', '성남'],
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

async function insertPlace(cafe, lat, lng) {
  const payload = {
    name: cafe.name,
    description: cafe.description ?? '',
    category: 'cafe',
    location: `POINT(${lng} ${lat})`,
    address: cafe.address,
    phone: cafe.phone ?? null,
    tags: cafe.tags ?? [],
    opening_hours: cafe.openingHours ?? null,
    parking_info: cafe.parkingInfo ?? null,
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
  console.log(`[INFO] ${BIKE_CAFES.length}곳 시드 시작\n`);
  let ok = 0, skip = 0, fail = 0;

  for (const cafe of BIKE_CAFES) {
    try {
      if (await alreadyExists(cafe.name, cafe.address)) {
        console.log(`[SKIP] ${cafe.name}`);
        skip++;
        continue;
      }
      const { latitude, longitude, matched } = await geocode(cafe.address);
      await insertPlace(cafe, latitude, longitude);
      console.log(`[OK]   ${cafe.name}  (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
      console.log(`       -> ${matched}`);
      ok++;
    } catch (e) {
      console.error(`[FAIL] ${cafe.name}: ${e.message}`);
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

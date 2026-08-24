// 장소 큐레이션 초기 데이터 준비 스크립트
//
// 기본 실행은 읽기 전용 점검이다.
//   node scripts/seed-place-curation.mjs
//
// 실제 반영은 큐레이션 마이그레이션 적용 후 아래 두 조건을 모두 만족해야 한다.
//   PLACE_CURATION_APPLY_CONFIRM=APPLY_PLACE_CURATION_20260822 \
//     node scripts/seed-place-curation.mjs --apply
//
// 반영 범위:
// - 운영자가 직접 검증한 43곳을 관련성 재검토 보호 대상으로 지정
// - 바이크 특화가 명확한 비보호 36곳을 검증 상태로 지정
// - 일반 목적지 성격이 강한 68곳은 숨기지 않고 관련성 재검토 큐에 유지
// - 폐업·이전·상호 변경 가능성이 있는 10곳을 사람 검토 큐에 추가
// - 공식 딜러 목록 12곳은 카카오의 이름·도로명주소가 정확히 일치할 때만 추가
//
// 이 스크립트는 장소를 자동으로 숨기거나 삭제하지 않는다.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const AUDIT_AT = '2026-08-22T00:00:00.000Z';
const SNAPSHOT_ACTIVE_COUNT = 147;
// 2026-08-22 10:03 KST에 감사한 147개 활성 장소 UUID 집합. 이름이 같아도 행이 교체되면 중단한다.
const BASE_SNAPSHOT_ID_SHA256 = '83c2a8e7ff2be2f1b02007618c64e77ca8697665cc8a0fcd8abfc70017719594';
const TRUSTED_RECHECK_AT = '2026-11-20T00:00:00.000Z';
const DEALER_RECHECK_AT = '2026-09-21T00:00:00.000Z';
const APPLY_CONFIRMATION = 'APPLY_PLACE_CURATION_20260822';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const STRICT = args.has('--strict');
const HELP = args.has('--help') || args.has('-h');
const ALLOWED_ARGS = new Set(['--apply', '--strict', '--help', '-h']);

const unknownArgs = [...args].filter((arg) => !ALLOWED_ARGS.has(arg));
if (unknownArgs.length > 0) {
  console.error(`[ERROR] 알 수 없는 옵션: ${unknownArgs.join(', ')}`);
  process.exit(1);
}

if (HELP) {
  console.log(`장소 큐레이션 초기 데이터를 점검하거나 반영합니다.

사용법:
  node scripts/seed-place-curation.mjs [--strict]
  PLACE_CURATION_APPLY_CONFIRM=${APPLY_CONFIRMATION} node scripts/seed-place-curation.mjs --apply

옵션:
  --apply   사전 점검을 모두 통과한 경우에만 Supabase에 반영
  --strict  읽기 전용 점검에서도 차단 항목이 있으면 종료 코드 1 반환`);
  process.exit(0);
}

function loadEnv() {
  try {
    const content = readFileSync('.env', 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env가 없으면 process.env만 사용한다.
  }
}

loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !KAKAO_KEY) {
  console.error(
    '[ERROR] 필수 환경변수 누락: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_KAKAO_REST_API_KEY',
  );
  process.exit(1);
}

if (APPLY && process.env.PLACE_CURATION_APPLY_CONFIRM !== APPLY_CONFIRMATION) {
  console.error('[ERROR] --apply 보호 확인값이 없습니다. 파일 상단의 실행 예시를 확인하세요.');
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};
const BASE_PLACE_COLUMNS =
  'id,name,address,category,approved,deleted_at,source_provider,source_place_id';
const CURATION_PLACE_COLUMNS =
  `${BASE_PLACE_COLUMNS},relevance_status,operational_status,is_curation_protected,last_verified_at,next_verification_at`;

const TRUSTED_PLACES = [
  { label: 'RSG 성수', aliases: ['RSG', 'RSG 성수'] },
  { label: '바이콩즈' },
  { label: '산일리오' },
  { label: '유명숯불닭갈비' },
  { label: '한국외국어대학교 글로벌캠퍼스' },
  { label: '한계령휴게소' },
  { label: '진고개정상휴게소' },
  { label: '티하우스 에덴', aliases: ['티하우스에덴', '티하우스 에덴'] },
  { label: '고구려돼지갈비' },
  { label: '다산생태공원' },
  { label: '두물머리' },
  { label: '물의정원' },
  { label: '행주산성' },
  { label: '아르테파인' },
  { label: '더티트렁크' },
  { label: '여기가 좋겠네 휴게소' },
  { label: '카페 피트', aliases: ['카페피트', '카페 피트'] },
  { label: '양평 만남의 광장' },
  { label: '팔당초계국수 본점' },
  { label: '에스워시' },
  { label: '로얄엔필드' },
  { label: '트라이엄프코리아 강동점' },
  { label: '와우모터스' },
  { label: 'NTBmoto' },
  { label: '산정호수' },
  { label: '포천아우토반카페' },
  { label: '모토몰' },
  { label: '안라커피' },
  { label: '할리우드' },
  { label: '로맨틱투휠' },
  { label: '올드타운로드 Cafe', aliases: ['올드타운로드cafe', '올드타운로드 Cafe'] },
  { label: '롤링트라이브' },
  { label: '파주 만남의 광장' },
  { label: '문지리535' },
  { label: '네이버후드' },
  { label: '리로드' },
  { label: '라드' },
  { label: '강화 만남의 광장' },
  { label: '두바퀴' },
  { label: '헬로모토' },
  { label: '산들' },
  { label: 'EAST7' },
];

// 상호·정체성·전문 업종만으로도 바이크 관련성이 명확하지만 운영자 보호 목록은 아닌 장소.
const BIKE_EXPLICIT_PLACES = [
  '100ROAD',
  '395밤바리',
  'KUTH',
  '강만장',
  '귀산라이더카페 브룸',
  '느만장',
  '담만장',
  '더로드1423',
  '돈키호테 1988',
  '라이더카페더블유',
  '로밍온앤오프 & 롤링하츠',
  '루트세븐 레저타운',
  '모토매니아카페',
  '바이크루 원주점',
  '바이크와커피가만나다',
  '뱅어스',
  '블랙바트',
  '비엔비(B&B)',
  '에스쿠차르카페',
  '열화커피',
  '친봉산장',
  '카페 M.C',
  '카페 리미트',
  '카페 모토라드 성남',
  '카페 모토라드 이천',
  '카페 모토라드 합천',
  '카페194',
  '카페펑키',
  '카페피네스',
  '필립상회 & 카페 1.14km',
  '하이치치',
  '바이크마트 서울점',
  '바이크마트 청주점',
  '바이크월드',
  '바이크나라',
  '할리데이비슨',
].map((name) => ({ name }));

// 일반 목적지 성격이 강해 라이더 장소 적합성을 사람이 다시 판단할 활성 장소.
const RELEVANCE_REVIEW_PLACES = [
  // 일반 카페 5
  '브리끄',
  '아유스페이스',
  '왈츠와닥터만',
  '카페드220볼트',
  '하우스베이커리',
  // 캠핑장 7
  '높은터캠핑장',
  '덕유대야영장',
  '모구리야영장',
  '무릉계곡 힐링캠프장',
  '산여울캠핑장',
  '자라섬 캠핑장',
  '합강캠핑장',
  // 휴게소·고갯길 9
  '1100고지 휴게소',
  '광덕고개쉼터',
  '대관령마을휴게소',
  '말티재전망대',
  '성삼재휴게소',
  '이화령휴게소',
  '죽령주막',
  '지리산제일문 휴게소',
  '한티휴게소',
  // 일반 음식점 34
  '골막식당',
  '거북이횟집곰치국',
  '공가네 한우국밥전문점 하남점',
  '국일식당',
  '김앤김',
  '까꾸네모리국수',
  '단천식당',
  '달궁식당',
  '망향비빔국수 본점',
  '미사리밀빛초계국수 본점',
  '변산명인바지락죽',
  '산방식당',
  '삼대광양불고기집',
  '새재할매집',
  '새집추어탕',
  '샘밭막국수',
  '선광집',
  '세계주류마켓',
  '양지말화로구이',
  '어무이맛양평해장국 양평본점',
  '엄지매운탕',
  '여여식당',
  '옥천냉면 황해식당',
  '용바위식당',
  '우리식당',
  '원조이동김미자할머니갈비',
  '저곡식당',
  '주차장식당',
  '큰마을영양굴밥',
  '통나무집닭갈비',
  '팔당원조칼제비 본점',
  '하남면옥',
  '혜성식당',
  // 일반 명소 13
  '그리팅맨',
  '만항재',
  '미시령 옛길 정상',
  '북악팔각정',
  '비발디파크',
  '소금산 출렁다리',
  '소양강스카이워크',
  '아침고요수목원',
  '오두산통일전망대',
  '용문사',
  '정령치휴게소',
  '충주호',
  '헤이리예술마을',
].map((name) => ({ name }));

const REVIEW_CASES = [
  {
    name: '라이더카페더블유',
    key: 'rider-cafe-w-license-closed-20260528',
    sourceType: 'official_registry',
    signal: 'permanently_closed',
    strength: 'strong',
    sourceName: '지방행정인허가데이터개방',
    observedAt: '2026-05-28T00:00:00.000Z',
    note: '동일 상호·주소의 휴게음식점 인허가 폐업 신호. 현재 영업 여부를 최종 확인한 뒤에만 숨김 여부를 결정한다.',
  },
  {
    name: '필립상회 & 카페 1.14km',
    key: 'philip-store-cafe-identity-review-20260822',
    sourceType: 'manual_review',
    signal: 'identity_changed',
    strength: 'medium',
    sourceName: '운영 데이터 감사',
    observedAt: AUDIT_AT,
    note: '카페 폐업 신호가 있으나 같은 주소의 모터사이클 용품점 필립상회는 검색된다. 전체 숨김이 아니라 상호·카테고리 변경을 확인한다.',
  },
  {
    name: '죽령주막',
    key: 'jukryeong-remodeling-temporary-close-20260822',
    sourceType: 'manual_review',
    signal: 'temporarily_closed',
    strength: 'medium',
    sourceName: '운영 데이터 감사',
    observedAt: AUDIT_AT,
    note: '임시 휴업·리모델링 공개 신호가 있어 재개장 시점을 확인한다. 폐업으로 처리하지 않는다.',
  },
  {
    name: '돈키호테 1988',
    key: 'donquixote-dodoikku-rebrand-20260822',
    sourceType: 'manual_review',
    signal: 'identity_changed',
    strength: 'medium',
    sourceName: '운영 데이터 감사',
    observedAt: AUDIT_AT,
    note: 'DODOIKKU로 리브랜딩된 정황이 있어 공식 상호와 외부 장소 식별자를 확인한다.',
  },
  {
    name: '루트세븐 레저타운',
    key: 'route-seven-address-review-20260822',
    sourceType: 'manual_review',
    signal: 'moved',
    strength: 'medium',
    sourceName: '운영 데이터 감사',
    observedAt: AUDIT_AT,
    note: '현재 공개 주소가 동해대로 2829로 보이며 DB의 3166과 다르다. 동일 사업장 이전 여부를 확인한다.',
  },
  {
    name: '비엔비(B&B)',
    key: 'bnb-address-review-20260822',
    sourceType: 'manual_review',
    signal: 'moved',
    strength: 'medium',
    sourceName: '운영 데이터 감사',
    observedAt: AUDIT_AT,
    note: '부산 강서구 낙동남로 620으로 이전한 정황이 있다. 새 행을 추가하지 말고 기존 장소의 이전 여부를 확인한다.',
  },
  {
    name: '바이크마트 청주점',
    key: 'bikemart-cheongju-address-review-20260822',
    sourceType: 'official_website',
    signal: 'moved',
    strength: 'strong',
    sourceName: 'HJC 공식 대리점 안내',
    sourceUrl: 'https://hjchelmets.kr/pages/hjc-%ED%97%AC%EB%A9%A7-%EA%B3%B5%EC%8B%9D-%EB%8C%80%EB%A6%AC%EC%A0%90',
    observedAt: AUDIT_AT,
    note: '공식 대리점 주소가 충북 청주시 청원구 무심동로 744로 표시된다. 기존 중앙로256번길 9에서 이전했는지 확인한다.',
  },
  {
    name: '롤링트라이브',
    key: 'rolling-tribe-license-closed-20260701',
    sourceType: 'official_registry',
    signal: 'permanently_closed',
    strength: 'strong',
    sourceName: '지방행정인허가데이터개방',
    observedAt: '2026-07-01T00:00:00.000Z',
    note: '동일 상호·주소의 인허가 폐업 신호. 운영자 보호 장소이므로 자동 숨김하지 않고 현재 운영 주체를 직접 확인한다.',
  },
  {
    name: '두바퀴',
    key: 'dubagwi-license-closed-20251229',
    sourceType: 'official_registry',
    signal: 'permanently_closed',
    strength: 'strong',
    sourceName: '지방행정인허가데이터개방',
    observedAt: '2025-12-29T00:00:00.000Z',
    note: '동일 상호·주소의 인허가 폐업 신호. 운영자 보호 장소이므로 자동 숨김하지 않고 현재 운영 주체를 직접 확인한다.',
  },
  {
    name: '티하우스에덴',
    aliases: ['티하우스에덴', '티하우스 에덴'],
    key: 'teahouse-eden-license-closed-20210122',
    sourceType: 'official_registry',
    signal: 'permanently_closed',
    strength: 'strong',
    sourceName: '지방행정인허가데이터개방',
    observedAt: '2021-01-22T00:00:00.000Z',
    note: '과거 동일 상호·주소 인허가 폐업 신호. 운영자 또는 인허가 주체 변경 가능성이 있어 자동 숨김하지 않고 현재 영업을 직접 확인한다.',
  },
];

const OFFICIAL_DEALERS = [
  {
    name: '인디언 모터사이클 춘천 전시장',
    kakaoNames: ['인디언 모터사이클 춘천 전시장', '인디언모터사이클 춘천전시장'],
    address: '강원 춘천시 동내면 거두길 89',
    region: '춘천',
    brand: '인디언 모터사이클',
    officialUrl: 'https://www.indianmotorcycle.kr/dealer/list.html',
  },
  {
    name: '스즈키 모터사이클 강릉점',
    kakaoNames: ['스즈키 모터사이클 강릉점', '스즈키 강릉점'],
    address: '강원 강릉시 경강로 2173',
    region: '강릉',
    brand: '스즈키',
    officialUrl: 'https://www.suzuki.kr/dealer',
  },
  {
    name: '스즈키 모터사이클 천안 월드점',
    kakaoNames: [
      '스즈키 모터사이클 천안 월드점',
      '스즈키모터사이클 천안월드점',
      '스즈키월드 천안점',
    ],
    address: '충남 천안시 동남구 중앙로 259',
    region: '천안',
    brand: '스즈키',
    officialUrl: 'https://www.suzuki.kr/dealer',
  },
  {
    name: '혼다 모터사이클 대전 딜러',
    kakaoNames: ['혼다 모터사이클 대전 딜러', '혼다모터사이클 대전딜러', '혼다모터사이클 대전점'],
    address: '대전 유성구 유성대로 583',
    region: '대전',
    brand: '혼다',
    officialUrl: 'https://www.hondakorea.co.kr/ajax/motorcycle/sales/DealerNetwork.do',
  },
  {
    name: 'BMW 모토라드 전주',
    kakaoNames: ['BMW 모토라드 전주', 'BMW모토라드 전주점'],
    address: '전북 전주시 덕진구 정여립로 1107',
    region: '전주',
    brand: 'BMW 모토라드',
    officialUrl: 'https://www.bmw-motorrad.co.kr/ko/public-pool/content-pool/dealer-network.html',
  },
  {
    name: '스즈키 모터사이클 광주점',
    kakaoNames: ['스즈키 모터사이클 광주점', '월드모터샵'],
    address: '광주 북구 무등로 280',
    region: '광주',
    brand: '스즈키',
    officialUrl: 'https://www.suzuki.kr/dealer',
  },
  {
    name: '할리데이비슨 대구점',
    kakaoNames: ['할리데이비슨 대구점', '할리데이비슨코리아 대구점'],
    address: '대구 동구 팔공로 380',
    region: '대구',
    brand: '할리데이비슨',
    officialUrl: 'https://harley-korea.com/about-us',
  },
  {
    name: '스즈키 모터사이클 울산남구점',
    kakaoNames: ['스즈키 모터사이클 울산남구점', '스즈키 울산점'],
    address: '울산 남구 수암로 79',
    region: '울산',
    brand: '스즈키',
    officialUrl: 'https://www.suzuki.kr/dealer',
  },
  {
    name: '인디언 모터사이클 부산 전시장',
    kakaoNames: [
      '인디언 모터사이클 부산 전시장',
      '인디언모터사이클 부산전시장',
      '인디언모터사이클 부산',
    ],
    address: '부산 수영구 광남로 173',
    region: '부산',
    brand: '인디언 모터사이클',
    officialUrl: 'https://www.indianmotorcycle.kr/dealer/list.html',
  },
  {
    name: '스즈키 모터사이클 진주점',
    address: '경남 진주시 진양호로 93-1',
    region: '진주',
    brand: '스즈키',
    officialUrl: 'https://www.suzuki.kr/dealer',
  },
  {
    name: 'BMW 모토라드 창원',
    address: '경남 창원시 마산회원구 내서읍 호원로 151',
    region: '창원',
    brand: 'BMW 모토라드',
    officialUrl: 'https://www.bmw-motorrad.co.kr/ko/public-pool/content-pool/dealer-network.html',
  },
  {
    name: '인디언 모터사이클 평택 전시장',
    kakaoNames: [
      '인디언 모터사이클 평택 전시장',
      '인디언모터사이클 평택전시장',
      '인디언 모터사이클 평택',
    ],
    address: '경기 평택시 동막길 27',
    region: '평택',
    brand: '인디언 모터사이클',
    officialUrl: 'https://www.indianmotorcycle.kr/dealer/list.html',
  },
];

function normalizeName(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizeAddress(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/강원특별자치도|강원도/g, '강원')
    .replace(/전북특별자치도|전라북도/g, '전북')
    .replace(/전라남도/g, '전남')
    .replace(/경상북도/g, '경북')
    .replace(/경상남도/g, '경남')
    .replace(/충청북도/g, '충북')
    .replace(/충청남도/g, '충남')
    .replace(/경기도/g, '경기')
    .replace(/서울특별시/g, '서울')
    .replace(/부산광역시/g, '부산')
    .replace(/대구광역시/g, '대구')
    .replace(/인천광역시/g, '인천')
    .replace(/광주광역시/g, '광주')
    .replace(/전남광주통합특별시/g, '광주')
    .replace(/대전광역시/g, '대전')
    .replace(/울산광역시/g, '울산')
    .replace(/세종특별자치시/g, '세종')
    .replace(/제주특별자치도|제주도/g, '제주')
    .replace(/[^\p{L}\p{N}-]/gu, '');
}

function aliasesOf(item) {
  return item.aliases ?? [item.name ?? item.label];
}

function resolveUniquePlace(item, activePlaces) {
  const aliases = new Set(aliasesOf(item).map(normalizeName));
  const matches = activePlaces.filter((place) => aliases.has(normalizeName(place.name)));
  if (matches.length !== 1) return { matches, place: null };
  return { matches, place: matches[0] };
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return body;
}

async function getPlaces() {
  const columns = APPLY ? CURATION_PLACE_COLUMNS : BASE_PLACE_COLUMNS;
  const params = new URLSearchParams({ select: columns, order: 'created_at.asc', limit: '1000' });
  return requestJson(`${REST}/places?${params}`, { headers: SUPABASE_HEADERS });
}

async function getCurationPlace(id) {
  const params = new URLSearchParams({
    select: CURATION_PLACE_COLUMNS,
    id: `eq.${id}`,
    limit: '1',
  });
  const rows = await requestJson(`${REST}/places?${params}`, { headers: SUPABASE_HEADERS });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`큐레이션 장소를 다시 조회할 수 없습니다: ${id}`);
  }
  return rows[0];
}

async function kakaoKeyword(query) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', query);
  url.searchParams.set('size', '15');
  const result = await requestJson(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  return result.documents ?? [];
}

async function verifyDealer(candidate) {
  const queries = [
    candidate.name,
    ...(candidate.kakaoNames ?? []),
    `${candidate.brand} ${candidate.region}`,
    candidate.address,
  ];
  const documents = new Map();

  for (const query of new Set(queries)) {
    for (const document of await kakaoKeyword(query)) {
      documents.set(document.id, document);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const allowedNames = new Set((candidate.kakaoNames ?? [candidate.name]).map(normalizeName));
  const expectedAddress = normalizeAddress(candidate.address);
  const exact = [...documents.values()].filter((document) => {
    const nameMatches = allowedNames.has(normalizeName(document.place_name));
    const documentAddress = document.road_address_name || document.address_name;
    return nameMatches && normalizeAddress(documentAddress) === expectedAddress;
  });

  return {
    documents: [...documents.values()],
    exact,
    match: exact.length === 1 ? exact[0] : null,
  };
}

function nonDeletedDuplicatesForDealer(candidate, match, allPlaces) {
  const nonDeletedPlaces = allPlaces.filter((place) => place.deleted_at === null);
  const matchName = normalizeName(match.place_name);
  const matchAddress = normalizeAddress(match.road_address_name || match.address_name);
  const candidateName = normalizeName(candidate.name);
  const candidateAddress = normalizeAddress(candidate.address);
  return nonDeletedPlaces.filter(
    (place) => {
      const sameSource =
        place.source_provider === 'kakao' && place.source_place_id === match.id;
      const placeName = normalizeName(place.name);
      const placeAddress = normalizeAddress(place.address);
      const sameKakaoIdentity = placeName === matchName && placeAddress === matchAddress;
      const sameOfficialIdentity =
        placeName === candidateName && placeAddress === candidateAddress;
      return sameSource || sameKakaoIdentity || sameOfficialIdentity;
    },
  );
}

function deletedDuplicateForDealer(candidate, match, allPlaces) {
  const deletedPlaces = allPlaces.filter((place) => place.deleted_at !== null);
  const names = new Set([normalizeName(candidate.name), normalizeName(match.place_name)]);
  const addresses = new Set([
    normalizeAddress(candidate.address),
    normalizeAddress(match.road_address_name || match.address_name),
  ]);
  return deletedPlaces.find(
    (place) =>
      (place.source_provider === 'kakao' && place.source_place_id === match.id)
      || (names.has(normalizeName(place.name)) && addresses.has(normalizeAddress(place.address))),
  );
}

function addExpectedFilter(params, column, value) {
  params.set(column, value === null || value === undefined ? 'is.null' : `eq.${value}`);
}

async function patchPlace(place, payload) {
  const params = new URLSearchParams({ id: `eq.${place.id}` });
  for (const column of [
    'name',
    'address',
    'category',
    'approved',
    'deleted_at',
    'source_provider',
    'source_place_id',
    'relevance_status',
    'operational_status',
    'is_curation_protected',
    'last_verified_at',
    'next_verification_at',
  ]) {
    addExpectedFilter(params, column, place[column]);
  }
  const rows = await requestJson(`${REST}/places?${params}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(
      `${place.name}: 점검 이후 장소 상태가 달라져 업데이트하지 않았습니다. dry-run부터 다시 실행하세요.`,
    );
  }
  return rows[0];
}

async function insertPlace(payload) {
  const rows = await requestJson(`${REST}/places`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`장소 추가 결과가 1행이 아닙니다: ${payload.name}`);
  }
  return rows[0];
}

async function upsertEvidence(payload) {
  const existingQuery = new URLSearchParams({
    select: '*',
    place_id: `eq.${payload.place_id}`,
    source_type: `eq.${payload.source_type}`,
    source_reference: `eq.${payload.source_reference}`,
    observed_at: `eq.${payload.observed_at}`,
    limit: '1',
  });
  const findExisting = () => requestJson(`${REST}/place_curation_evidence?${existingQuery}`, {
    headers: SUPABASE_HEADERS,
  });
  const existing = await findExisting();
  if (Array.isArray(existing) && existing.length === 1) return existing[0];

  const response = await fetch(`${REST}/place_curation_evidence`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (response.ok) {
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length === 1) return rows[0];
  } else if (response.status === 409) {
    // 동시에 같은 근거가 추가됐다면 고유 인덱스가 중복을 막는다.
    const raced = await findExisting();
    if (Array.isArray(raced) && raced.length === 1) return raced[0];
  } else {
    throw new Error(
      `큐레이션 근거 추가 실패 ${response.status}: ${await response.text()}`,
    );
  }

  if (!Array.isArray(existing) || existing.length !== 1) {
    throw new Error(`큐레이션 근거 upsert 결과를 확인할 수 없습니다: ${payload.source_reference}`);
  }
  return existing[0];
}

async function actionExists(placeId, actionType, reason) {
  const query = new URLSearchParams({
    select: 'id',
    place_id: `eq.${placeId}`,
    action_type: `eq.${actionType}`,
    reason: `eq.${reason}`,
    limit: '1',
  });
  const rows = await requestJson(`${REST}/place_curation_actions?${query}`, {
    headers: SUPABASE_HEADERS,
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function insertAction(payload) {
  if (await actionExists(payload.place_id, payload.action_type, payload.reason)) return false;
  const response = await fetch(`${REST}/place_curation_actions`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (response.ok) return true;
  if (
    response.status === 409
    && await actionExists(payload.place_id, payload.action_type, payload.reason)
  ) {
    return false;
  }
  throw new Error(`큐레이션 작업 로그 추가 실패 ${response.status}: ${await response.text()}`);
}

function placeState(place) {
  return {
    name: place.name,
    address: place.address,
    category: place.category,
    approved: place.approved,
    deleted_at: place.deleted_at,
    source_provider: place.source_provider,
    source_place_id: place.source_place_id,
    relevance_status: place.relevance_status,
    operational_status: place.operational_status,
    is_curation_protected: place.is_curation_protected,
    last_verified_at: place.last_verified_at,
    next_verification_at: place.next_verification_at,
  };
}

function sameInstant(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return new Date(left).getTime() === new Date(right).getTime();
}

function matchesState(place, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (key.endsWith('_at')) return sameInstant(place[key], value);
    return place[key] === value;
  });
}

function assertSeedState(place, label, allowedStates) {
  if (allowedStates.some((expected) => matchesState(place, expected))) return;
  throw new Error(
    `${label}: 감사 이후 큐레이션 상태가 달라 정적 시드로 덮어쓰지 않습니다.`,
  );
}

function preservedPreviousState(evidence, fallback) {
  const previous = evidence?.details?.previous_state;
  return previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous
    : fallback;
}

function placeSnapshotFingerprint(rows) {
  const columns = [
    'id',
    'name',
    'address',
    'category',
    'approved',
    'deleted_at',
    'source_provider',
    'source_place_id',
    'relevance_status',
    'operational_status',
    'is_curation_protected',
    'last_verified_at',
    'next_verification_at',
  ];
  const normalized = rows
    .map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => JSON.stringify(row))
    .join('\n');
  return createHash('sha256').update(`${normalized}\n`).digest('hex');
}

function idSetFingerprint(rows) {
  const normalized = `${rows.map((row) => row.id).sort().join('\n')}\n`;
  return createHash('sha256').update(normalized).digest('hex');
}

async function applyTrustedPlace(item, place, queuedForReview) {
  const actionType = 'protect';
  const reason = 'trusted-list-20260822';
  if (await actionExists(place.id, actionType, reason)) return 'unchanged';

  const next = {
    relevance_status: 'trusted',
    is_curation_protected: true,
    last_verified_at: AUDIT_AT,
    next_verification_at: queuedForReview ? AUDIT_AT : TRUSTED_RECHECK_AT,
  };
  assertSeedState(place, `보호 장소 ${place.name}`, [
    {
      relevance_status: 'review',
      is_curation_protected: false,
      last_verified_at: null,
      next_verification_at: null,
    },
    next,
  ]);

  const alreadyApplied =
    place.relevance_status === next.relevance_status
    && place.is_curation_protected === true
    && sameInstant(place.last_verified_at, next.last_verified_at)
    && sameInstant(place.next_verification_at, next.next_verification_at);
  const currentState = placeState(place);
  const evidence = await upsertEvidence({
    place_id: place.id,
    source_type: 'manual_review',
    signal: 'relevance_confirmed',
    strength: 'strong',
    source_name: '운영자 직접 검증 목록',
    source_reference: `trusted-list-20260822:${normalizeName(item.label)}`,
    observed_at: AUDIT_AT,
    details: {
      supplied_name: item.label,
      matched_name: place.name,
      note: '운영자가 직접 검증해 관련성 자동 재검토에서 보호한다. 운영 여부 정기 점검은 계속한다.',
      previous_state: currentState,
    },
    recorded_by: 'seed-place-curation',
  });
  const previous = preservedPreviousState(evidence, currentState);
  const updated = alreadyApplied ? place : await patchPlace(place, next);

  // 상태만 먼저 반영된 실행을 복구할 수 있도록 작업 로그는 항상 존재 여부를 확인한다.
  await insertAction({
    place_id: place.id,
    evidence_id: evidence.id,
    action_type: actionType,
    reason,
    previous_state: previous,
    new_state: placeState(updated),
    acted_by: 'seed-place-curation',
  });
  return alreadyApplied ? 'unchanged' : 'updated';
}

async function applyVerifiedPlace(item, place, queuedForReview) {
  const actionType = 'verify_relevance';
  const reason = 'bike-explicit-audit-20260822';
  if (await actionExists(place.id, actionType, reason)) return 'unchanged';

  const next = {
    relevance_status: 'verified',
    last_verified_at: AUDIT_AT,
    next_verification_at: queuedForReview ? AUDIT_AT : DEALER_RECHECK_AT,
  };
  assertSeedState(place, `바이크 특화 장소 ${place.name}`, [
    {
      relevance_status: 'review',
      is_curation_protected: false,
      last_verified_at: null,
      next_verification_at: null,
    },
    { ...next, is_curation_protected: false },
  ]);

  const alreadyApplied =
    place.relevance_status === next.relevance_status
    && sameInstant(place.last_verified_at, next.last_verified_at)
    && sameInstant(place.next_verification_at, next.next_verification_at);
  const currentState = placeState(place);
  const evidence = await upsertEvidence({
    place_id: place.id,
    source_type: 'manual_review',
    signal: 'relevance_confirmed',
    strength: 'medium',
    source_name: '바이크 특화 장소 감사',
    source_reference: `bike-explicit-20260822:${normalizeName(item.name)}`,
    observed_at: AUDIT_AT,
    details: {
      matched_name: place.name,
      note: '상호·테마 또는 전문 업종에서 바이크 관련성이 명확해 검증 상태로 분류한다. 운영자 보호 대상은 아니다.',
      previous_state: currentState,
    },
    recorded_by: 'seed-place-curation',
  });
  const previous = preservedPreviousState(evidence, currentState);
  const updated = alreadyApplied ? place : await patchPlace(place, next);

  await insertAction({
    place_id: place.id,
    evidence_id: evidence.id,
    action_type: actionType,
    reason,
    previous_state: previous,
    new_state: placeState(updated),
    acted_by: 'seed-place-curation',
  });
  return alreadyApplied ? 'unchanged' : 'updated';
}

async function applyRelevanceReviewPlace(item, place) {
  const actionType = 'queue_review';
  const reason = 'relevance-review-audit-20260822';
  if (await actionExists(place.id, actionType, reason)) return 'unchanged';

  const next = {
    relevance_status: 'review',
    next_verification_at: AUDIT_AT,
  };
  assertSeedState(place, `관련성 재검토 장소 ${place.name}`, [
    {
      relevance_status: 'review',
      is_curation_protected: false,
      last_verified_at: null,
      next_verification_at: null,
    },
    {
      relevance_status: 'review',
      is_curation_protected: false,
      last_verified_at: null,
      next_verification_at: AUDIT_AT,
    },
  ]);

  const alreadyApplied =
    place.relevance_status === next.relevance_status
    && sameInstant(place.next_verification_at, next.next_verification_at);
  const currentState = placeState(place);
  const evidence = await upsertEvidence({
    place_id: place.id,
    source_type: 'manual_review',
    signal: 'unknown',
    strength: 'medium',
    source_name: '바이크 장소 적합성 감사',
    source_reference: `relevance-review-20260822:${normalizeName(item.name)}`,
    observed_at: AUDIT_AT,
    details: {
      matched_name: place.name,
      note: '일반 목적지 성격이 강해 라이더 장소로 유지할 근거를 사람이 다시 검토한다. 자동 숨김하지 않는다.',
      automatic_hide_allowed: false,
      previous_state: currentState,
    },
    recorded_by: 'seed-place-curation',
  });
  const previous = preservedPreviousState(evidence, currentState);
  const updated = alreadyApplied ? place : await patchPlace(place, next);

  await insertAction({
    place_id: place.id,
    evidence_id: evidence.id,
    action_type: actionType,
    reason,
    previous_state: previous,
    new_state: placeState(updated),
    acted_by: 'seed-place-curation',
  });
  return alreadyApplied ? 'unchanged' : 'queued';
}

async function applyReviewCase(reviewCase, place) {
  const actionType = 'queue_review';
  const reason = `curation-audit-20260822:${reviewCase.key}`;
  if (await actionExists(place.id, actionType, reason)) return 'unchanged';

  assertSeedState(place, `운영 우선검토 장소 ${place.name}`, [
    {
      last_verified_at: AUDIT_AT,
      next_verification_at: AUDIT_AT,
    },
    {
      last_verified_at: null,
      next_verification_at: AUDIT_AT,
    },
  ]);
  const currentState = placeState(place);
  const evidence = await upsertEvidence({
    place_id: place.id,
    source_type: reviewCase.sourceType,
    signal: reviewCase.signal,
    strength: reviewCase.strength,
    source_name: reviewCase.sourceName,
    source_url: reviewCase.sourceUrl ?? null,
    source_reference: `curation-audit-20260822:${reviewCase.key}`,
    observed_at: reviewCase.observedAt,
    details: {
      note: reviewCase.note,
      protected_at_queue_time: place.is_curation_protected === true,
      automatic_hide_allowed: false,
      previous_state: currentState,
    },
    recorded_by: 'seed-place-curation',
  });

  const alreadyDue = sameInstant(place.next_verification_at, AUDIT_AT);
  const updated = alreadyDue
    ? place
    : await patchPlace(place, { next_verification_at: AUDIT_AT });
  const previous = preservedPreviousState(evidence, currentState);

  await insertAction({
    place_id: place.id,
    evidence_id: evidence.id,
    action_type: actionType,
    reason,
    previous_state: previous,
    new_state: placeState(updated),
    acted_by: 'seed-place-curation',
  });
  return alreadyDue ? 'unchanged' : 'queued';
}

async function applyDealer(candidate, match, existing, wasBasePlace) {
  const location = `POINT(${Number(match.x)} ${Number(match.y)})`;
  const canonicalAddress = match.road_address_name || match.address_name;
  const actionType = 'register_place';
  const reason = `official-dealer-seed-20260822:${match.id}`;
  const sharedState = {
    relevance_status: 'verified',
    operational_status: 'operational',
    last_verified_at: AUDIT_AT,
    next_verification_at: DEALER_RECHECK_AT,
  };

  let place = existing;
  let currentState = existing && wasBasePlace ? placeState(existing) : {};
  let stateChanged = false;

  if (place && await actionExists(place.id, actionType, reason)) return 'unchanged';

  if (!place) {
    place = await insertPlace({
      name: candidate.name,
      description: `${candidate.brand} 공식 딜러 네트워크에 등록된 ${candidate.region} 모터사이클 판매·정비점이에요.`,
      category: 'repair_shop',
      location,
      address: canonicalAddress,
      phone: match.phone || null,
      tags: ['바이크사', '공식 딜러', candidate.region],
      approved: true,
      source_provider: 'kakao',
      source_place_id: match.id,
      is_curation_protected: false,
      ...sharedState,
    });
    stateChanged = true;
  } else {
    if (place.approved !== true) {
      throw new Error(`${place.name}: 승인되지 않은 기존 제보는 큐레이션 시드가 수정할 수 없습니다.`);
    }
    const identityConflict =
      place.source_place_id
      && (place.source_provider !== 'kakao' || place.source_place_id !== match.id);
    if (identityConflict) {
      throw new Error(`${place.name}: 기존 외부 장소 식별자와 카카오 매칭이 충돌합니다.`);
    }
    const next = {
      relevance_status: sharedState.relevance_status,
      operational_status: sharedState.operational_status,
      is_curation_protected: false,
      last_verified_at: sharedState.last_verified_at,
      next_verification_at: sharedState.next_verification_at,
    };
    assertSeedState(place, `공식 딜러 ${place.name}`, [
      {
        relevance_status: 'review',
        operational_status: 'unknown',
        is_curation_protected: false,
        last_verified_at: null,
        next_verification_at: null,
      },
      next,
    ]);
    const alreadyApplied =
      place.source_provider === 'kakao'
      && place.source_place_id === match.id
      && place.relevance_status === sharedState.relevance_status
      && place.operational_status === sharedState.operational_status
      && sameInstant(place.last_verified_at, sharedState.last_verified_at)
      && sameInstant(place.next_verification_at, sharedState.next_verification_at);
    stateChanged = !alreadyApplied;
  }

  const officialEvidence = await upsertEvidence({
    place_id: place.id,
    source_type: 'official_website',
    signal: 'operational',
    strength: 'strong',
    source_name: `${candidate.brand} 공식 딜러 안내`,
    source_url: candidate.officialUrl,
    source_reference: candidate.officialUrl,
    observed_at: AUDIT_AT,
    details: {
      listed_name: candidate.name,
      listed_address: candidate.address,
      previous_state: currentState,
    },
    recorded_by: 'seed-place-curation',
  });
  await upsertEvidence({
    place_id: place.id,
    source_type: 'map_provider',
    signal: 'operational',
    strength: 'medium',
    source_name: '카카오 로컬',
    source_url: match.place_url || null,
    source_reference: `kakao:${match.id}`,
    observed_at: AUDIT_AT,
    details: {
      matched_name: match.place_name,
      matched_address: canonicalAddress,
      category_name: match.category_name,
    },
    recorded_by: 'seed-place-curation',
  });
  currentState = preservedPreviousState(officialEvidence, currentState);

  if (existing && stateChanged) {
    place = await patchPlace(place, {
      source_provider: 'kakao',
      source_place_id: match.id,
      ...sharedState,
    });
  }

  await insertAction({
    place_id: place.id,
    evidence_id: officialEvidence.id,
    action_type: actionType,
    reason,
    previous_state: currentState,
    new_state: placeState(place),
    acted_by: 'seed-place-curation',
  });
  if (!existing) return 'inserted';
  return stateChanged ? 'updated' : 'unchanged';
}

async function main() {
  console.log(`[MODE] ${APPLY ? 'APPLY' : 'DRY RUN (읽기 전용)'}`);
  console.log(
    `[INFO] 관련성 보호 ${TRUSTED_PLACES.length}곳 · 검증 ${BIKE_EXPLICIT_PLACES.length}곳`
    + ` · 재검토 ${RELEVANCE_REVIEW_PLACES.length}곳 · 운영 우선검토 ${REVIEW_CASES.length}곳`
    + ` · 전국 후보 ${OFFICIAL_DEALERS.length}곳\n`,
  );

  const allPlaces = await getPlaces();
  const initialSnapshotFingerprint = placeSnapshotFingerprint(allPlaces);
  const activePlaces = allPlaces.filter(
    (place) => place.approved === true && place.deleted_at === null,
  );
  const blockers = [];
  const heldDealers = [];

  const trustedPlans = TRUSTED_PLACES.map((item) => {
    const resolution = resolveUniquePlace(item, activePlaces);
    if (!resolution.place) {
      blockers.push(
        `보호 장소 ${item.label}: 활성 일치 ${resolution.matches.length}건 (${resolution.matches.map((p) => p.name).join(', ') || '없음'})`,
      );
    }
    return { item, place: resolution.place };
  });

  const verifiedPlans = BIKE_EXPLICIT_PLACES.map((item) => {
    const resolution = resolveUniquePlace(item, activePlaces);
    if (!resolution.place) {
      blockers.push(
        `바이크 특화 장소 ${item.name}: 활성 일치 ${resolution.matches.length}건 (${resolution.matches.map((p) => p.name).join(', ') || '없음'})`,
      );
    }
    return { item, place: resolution.place };
  });

  const relevanceReviewPlans = RELEVANCE_REVIEW_PLACES.map((item) => {
    const resolution = resolveUniquePlace(item, activePlaces);
    if (!resolution.place) {
      blockers.push(
        `관련성 재검토 장소 ${item.name}: 활성 일치 ${resolution.matches.length}건 (${resolution.matches.map((p) => p.name).join(', ') || '없음'})`,
      );
    }
    return { item, place: resolution.place };
  });

  const priorityReviewPlans = REVIEW_CASES.map((reviewCase) => {
    const resolution = resolveUniquePlace(reviewCase, activePlaces);
    if (!resolution.place) {
      blockers.push(
        `검토 장소 ${reviewCase.name}: 활성 일치 ${resolution.matches.length}건 (${resolution.matches.map((p) => p.name).join(', ') || '없음'})`,
      );
    }
    return { reviewCase, place: resolution.place };
  });

  const declaredCount =
    TRUSTED_PLACES.length + BIKE_EXPLICIT_PLACES.length + RELEVANCE_REVIEW_PLACES.length;
  if (declaredCount !== SNAPSHOT_ACTIVE_COUNT) {
    blockers.push(
      `분류 상수 합계 ${declaredCount}건이 기준 스냅샷 ${SNAPSHOT_ACTIVE_COUNT}건과 다름`,
    );
  }
  const classificationByPlace = new Map();
  for (const [classification, plans] of [
    ['trusted', trustedPlans],
    ['verified', verifiedPlans],
    ['review', relevanceReviewPlans],
  ]) {
    for (const plan of plans) {
      if (!plan.place) continue;
      const previousClassification = classificationByPlace.get(plan.place.id);
      if (previousClassification) {
        blockers.push(
          `장소 ${plan.place.name}가 ${previousClassification}, ${classification} 분류에 중복됨`,
        );
      } else {
        classificationByPlace.set(plan.place.id, classification);
      }
    }
  }

  const unclassified = activePlaces.filter((place) => !classificationByPlace.has(place.id));
  if (classificationByPlace.size !== SNAPSHOT_ACTIVE_COUNT) {
    blockers.push(
      `고유 분류 장소 ${classificationByPlace.size}건이 기준 스냅샷 ${SNAPSHOT_ACTIVE_COUNT}건과 다름`,
    );
  }
  const classifiedRows = [...classificationByPlace.keys()].map((id) => ({ id }));
  const baseSnapshotFingerprint = idSetFingerprint(classifiedRows);
  if (baseSnapshotFingerprint !== BASE_SNAPSHOT_ID_SHA256) {
    blockers.push('147곳 기본 스냅샷의 장소 ID 집합이 감사 당시와 다름');
  }

  console.log('=== 운영자 검증 보호 목록 ===');
  for (const { item, place } of trustedPlans) {
    console.log(place ? `[OK] ${item.label} → ${place.name}` : `[BLOCK] ${item.label}`);
  }

  console.log('\n=== 바이크 특화 검증 목록 ===');
  for (const { item, place } of verifiedPlans) {
    console.log(place ? `[OK] ${item.name} → ${place.name}` : `[BLOCK] ${item.name}`);
  }

  console.log('\n=== 관련성 재검토 목록 (자동 숨김 없음) ===');
  for (const { item, place } of relevanceReviewPlans) {
    console.log(place ? `[OK] ${item.name} → ${place.name}` : `[BLOCK] ${item.name}`);
  }

  console.log('\n=== 우선 운영 검토 큐 ===');
  for (const { reviewCase, place } of priorityReviewPlans) {
    if (!place) {
      console.log(`[BLOCK] ${reviewCase.name}`);
      continue;
    }
    const protection = trustedPlans.some((plan) => plan.place?.id === place.id)
      || place.is_curation_protected === true;
    console.log(
      `[OK] ${reviewCase.name} · ${reviewCase.signal} · 보호=${protection ? '예' : '아니오'} · 자동 숨김=아니오`,
    );
  }

  console.log('\n=== 전국 공식 딜러 후보의 카카오 정확 일치 ===');
  const dealerPlans = [];
  for (const candidate of OFFICIAL_DEALERS) {
    const verification = await verifyDealer(candidate);
    if (!verification.match) {
      const found = verification.documents
        .slice(0, 3)
        .map((document) => `${document.place_name} / ${document.road_address_name || document.address_name}`)
        .join(' | ');
      heldDealers.push(
        `전국 후보 ${candidate.name}: 이름+주소 정확 일치 ${verification.exact.length}건 (${found || '검색 결과 없음'})`,
      );
      console.log(`[HOLD] ${candidate.name} · 정확 일치 ${verification.exact.length}건`);
      if (found) console.log(`        검색 상위: ${found}`);
      dealerPlans.push({ candidate, match: null, existing: null });
      continue;
    }

    const match = verification.match;
    const deleted = deletedDuplicateForDealer(candidate, match, allPlaces);
    if (deleted) {
      blockers.push(`전국 후보 ${candidate.name}: 삭제된 기존 장소 ${deleted.name}(${deleted.id})와 중복`);
      console.log(`[BLOCK] ${candidate.name} · 삭제된 장소와 중복`);
      dealerPlans.push({ candidate, match, existing: null });
      continue;
    }

    const nonDeletedDuplicates = nonDeletedDuplicatesForDealer(candidate, match, allPlaces);
    const unapprovedDuplicates = nonDeletedDuplicates.filter((place) => place.approved !== true);
    if (unapprovedDuplicates.length > 0) {
      blockers.push(
        `전국 후보 ${candidate.name}: 승인 전 제보 ${unapprovedDuplicates.map((place) => `${place.name}(${place.id})`).join(', ')}와 중복`,
      );
      console.log(`[BLOCK] ${candidate.name} · 승인 전 제보와 중복되어 수정하지 않음`);
      dealerPlans.push({ candidate, match, existing: null, blocked: true });
      continue;
    }

    const approvedDuplicates = nonDeletedDuplicates.filter((place) => place.approved === true);
    if (approvedDuplicates.length > 1) {
      blockers.push(
        `전국 후보 ${candidate.name}: 승인된 기존 장소가 ${approvedDuplicates.length}건 중복`,
      );
      console.log(`[BLOCK] ${candidate.name} · 승인된 기존 장소가 여러 건`);
      dealerPlans.push({ candidate, match, existing: null, blocked: true });
      continue;
    }

    const existing = approvedDuplicates[0] ?? null;
    console.log(
      `[OK] ${candidate.name} → ${match.place_name} / ${match.road_address_name || match.address_name}`
      + ` / Kakao ${match.id}${existing ? ` / 기존 ${existing.name}` : ' / 신규'}`,
    );
    dealerPlans.push({ candidate, match, existing });
  }

  const allowedDealerExtras = new Map();
  for (const plan of dealerPlans) {
    if (!plan.match || !plan.existing || plan.blocked) continue;
    if (classificationByPlace.has(plan.existing.id)) continue;
    const previousCandidate = allowedDealerExtras.get(plan.existing.id);
    if (previousCandidate) {
      blockers.push(
        `추가 활성 장소 ${plan.existing.name}가 전국 후보 ${previousCandidate}, ${plan.candidate.name}에 중복 매칭됨`,
      );
      continue;
    }
    allowedDealerExtras.set(plan.existing.id, plan.candidate.name);
  }

  const unexpectedExtras = unclassified.filter(
    (place) => !allowedDealerExtras.has(place.id),
  );
  if (unexpectedExtras.length > 0) {
    blockers.push(
      `감사 기본 스냅샷이나 검증된 전국 딜러가 아닌 활성 장소 ${unexpectedExtras.length}건: ${unexpectedExtras.map((place) => place.name).join(', ')}`,
    );
  }
  const expectedActiveCount = SNAPSHOT_ACTIVE_COUNT + allowedDealerExtras.size;
  if (activePlaces.length !== expectedActiveCount) {
    blockers.push(
      `활성 장소 ${activePlaces.length}건이 기본 ${SNAPSHOT_ACTIVE_COUNT} + 허용 딜러 ${allowedDealerExtras.size} = ${expectedActiveCount}건과 다름`,
    );
  }
  const matchedDealerPlans = dealerPlans.filter((plan) => plan.match && !plan.blocked);
  const existingDealerCount = matchedDealerPlans.filter((plan) => plan.existing).length;
  const newDealerCount = matchedDealerPlans.length - existingDealerCount;

  console.log('\n=== 사전 점검 요약 ===');
  console.log(`보호 목록 일치 ${trustedPlans.filter((plan) => plan.place).length}/${TRUSTED_PLACES.length}`);
  console.log(`검증 목록 일치 ${verifiedPlans.filter((plan) => plan.place).length}/${BIKE_EXPLICIT_PLACES.length}`);
  console.log(`관련성 재검토 일치 ${relevanceReviewPlans.filter((plan) => plan.place).length}/${RELEVANCE_REVIEW_PLACES.length}`);
  console.log(`활성 스냅샷 분류 ${classificationByPlace.size}/${SNAPSHOT_ACTIVE_COUNT}`);
  console.log(
    `공식 딜러 기존 ${existingDealerCount}곳 · 신규 예정 ${newDealerCount}곳`
    + ` · 기본 외 허용 활성 ${allowedDealerExtras.size}곳 · 전체 활성 ${activePlaces.length}곳`,
  );
  console.log(`운영 우선검토 일치 ${priorityReviewPlans.filter((plan) => plan.place).length}/${REVIEW_CASES.length}`);
  console.log(`전국 후보 정확 일치 ${matchedDealerPlans.length}/${OFFICIAL_DEALERS.length}`);

  if (heldDealers.length > 0) {
    console.log(`\n[HOLD] 카카오 정확 일치를 통과하지 못한 ${heldDealers.length}곳은 반영 대상에서 제외합니다.`);
    for (const held of heldDealers) console.log(`- ${held}`);
  }

  if (blockers.length > 0) {
    console.log(`\n[BLOCKED] ${blockers.length}개 항목을 먼저 해결해야 합니다.`);
    for (const blocker of blockers) console.log(`- ${blocker}`);
    if (APPLY || STRICT) process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log(
      `\n[READY] 검증된 전국 후보 ${matchedDealerPlans.length}곳(기존 ${existingDealerCount}, 신규 ${newDealerCount})을 포함한 반영 계획입니다. DB 변경은 수행하지 않았습니다.`,
    );
    if (STRICT && heldDealers.length > 0) process.exitCode = 1;
    return;
  }

  // 외부 매칭을 확인하는 동안 활성 목록이나 승인 전 제보가 바뀌면 오래된 계획으로 쓰지 않는다.
  const freshAllPlaces = await getPlaces();
  const freshActivePlaces = freshAllPlaces.filter(
    (place) => place.approved === true && place.deleted_at === null,
  );
  const concurrentBlockers = [];
  if (placeSnapshotFingerprint(freshAllPlaces) !== initialSnapshotFingerprint) {
    concurrentBlockers.push(
      '사전 점검 중 장소 식별 정보나 큐레이션 상태가 변경됨. dry-run부터 다시 실행해야 함',
    );
  }
  for (const plan of dealerPlans) {
    if (!plan.match || plan.blocked) continue;
    const duplicates = nonDeletedDuplicatesForDealer(
      plan.candidate,
      plan.match,
      freshAllPlaces,
    );
    const unapprovedDuplicates = duplicates.filter((place) => place.approved !== true);
    if (unapprovedDuplicates.length > 0) {
      concurrentBlockers.push(
        `전국 후보 ${plan.candidate.name}: 승인 전 제보 ${unapprovedDuplicates.map((place) => `${place.name}(${place.id})`).join(', ')}가 새로 확인됨`,
      );
    }
  }
  if (concurrentBlockers.length > 0) {
    console.log(`\n[BLOCKED] 반영 직전 스냅샷이 달라져 쓰기를 중단합니다.`);
    for (const blocker of concurrentBlockers) console.log(`- ${blocker}`);
    process.exitCode = 1;
    return;
  }

  console.log('\n=== 반영 ===');
  let protectedUpdated = 0;
  let verifiedUpdated = 0;
  let relevanceReviewsQueued = 0;
  let priorityReviewsQueued = 0;
  let dealersApplied = 0;

  for (const plan of trustedPlans) {
    const queuedForReview = priorityReviewPlans.some(
      (reviewPlan) => reviewPlan.place.id === plan.place.id,
    );
    const result = await applyTrustedPlace(plan.item, plan.place, queuedForReview);
    if (result === 'updated') protectedUpdated += 1;
    console.log(`[${result === 'updated' ? 'UPDATE' : 'SKIP'}] 보호 ${plan.place.name}`);
  }

  for (const plan of verifiedPlans) {
    const queuedForReview = priorityReviewPlans.some(
      (reviewPlan) => reviewPlan.place.id === plan.place.id,
    );
    const result = await applyVerifiedPlace(plan.item, plan.place, queuedForReview);
    if (result === 'updated') verifiedUpdated += 1;
    console.log(`[${result === 'updated' ? 'UPDATE' : 'SKIP'}] 검증 ${plan.place.name}`);
  }

  for (const plan of relevanceReviewPlans) {
    const result = await applyRelevanceReviewPlace(plan.item, plan.place);
    if (result === 'queued') relevanceReviewsQueued += 1;
    console.log(`[${result === 'queued' ? 'QUEUE' : 'SKIP'}] 관련성 재검토 ${plan.place.name}`);
  }

  for (const plan of priorityReviewPlans) {
    // 보호 상태 반영 이후의 값을 다시 읽어 감사 로그의 이전/이후 상태를 정확히 남긴다.
    const currentPlace = await getCurationPlace(plan.place.id);
    const result = await applyReviewCase(plan.reviewCase, currentPlace);
    if (result === 'queued') priorityReviewsQueued += 1;
    console.log(`[${result === 'queued' ? 'QUEUE' : 'SKIP'}] 운영 검토 ${plan.place.name}`);
  }

  for (const plan of dealerPlans) {
    if (!plan.match || plan.blocked) continue;
    const result = await applyDealer(
      plan.candidate,
      plan.match,
      plan.existing,
      plan.existing ? classificationByPlace.has(plan.existing.id) : false,
    );
    if (result !== 'unchanged') dealersApplied += 1;
    const label = result === 'inserted' ? 'INSERT' : result === 'updated' ? 'UPDATE' : 'SKIP';
    console.log(`[${label}] 공식 딜러 ${plan.match.place_name}`);
  }

  console.log(
    `\n[DONE] 보호 상태 변경 ${protectedUpdated} · 검증 상태 변경 ${verifiedUpdated}`
    + ` · 관련성 재검토 설정 ${relevanceReviewsQueued} · 운영 우선검토 설정 ${priorityReviewsQueued}`
    + ` · 공식 딜러 반영 ${dealersApplied}`,
  );
}

main().catch((error) => {
  console.error('[FATAL]', error instanceof Error ? error.message : error);
  process.exit(1);
});

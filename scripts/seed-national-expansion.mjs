// 전국 확장 시드: 장소 19곳(강원 6 · 충청/전라 6 · 경상/제주 7) + 코스 8개
//
// 실행: node scripts/seed-national-expansion.mjs
//
// - 장소 좌표는 카카오 로컬로 사전 검증한 값을 인라인 (지오코딩 재실행 없음)
// - 코스 경유지는 실행 시 카카오 키워드 검색으로 좌표 해석 (매칭명 로그로 확인)
// - approved=true 로 삽입 — 디스코드/AI 판정 트리거는 approved=false 에만 발동하므로 조용히 들어간다
//
// 필요 환경변수 (.env):
//   EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   EXPO_PUBLIC_KAKAO_REST_API_KEY

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
const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !KAKAO_KEY) {
  console.error('[ERROR] 필수 환경변수 누락: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_KAKAO_REST_API_KEY');
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// 장소 19곳 — 웹 근거 확인 + 카카오 지오코딩 검증 완료 (2026-07)
// ---------------------------------------------------------------------------
const PLACES = [
  // 강원 6
  {
    name: '느만장',
    category: 'cafe',
    address: '강원특별자치도 춘천시 동면 가락재로 177',
    lat: 37.9028036047235, lng: 127.791433074583,
    description: '춘천에서 홍천으로 넘어가는 56번 국도 느랏재 초입의 라이더 카페예요. 느랏재 와인딩을 마치고 마당에서 쉬어가기 좋고 바이크 동호회 전국 모임 장소로도 자주 쓰여요.',
    tags: ['바이크카페', '춘천', '느랏재'],
  },
  {
    name: '더로드1423',
    category: 'cafe',
    address: '강원특별자치도 영월군 주천면 송학주천로 1423',
    lat: 37.2700212764663, lng: 128.26992775023,
    description: '영월 주천면에 있는 라이더 카페로 커뮤니티에서는 주만장으로 불려요. 태백산맥을 넘는 라이더들의 휴식처로 알려져 있고 올드스쿨 록카페 분위기에 LP 감상 공간도 갖췄어요.',
    tags: ['바이크카페', '영월', '주만장'],
  },
  {
    name: '한계령휴게소',
    category: 'rest_stop',
    address: '강원특별자치도 양양군 서면 설악로 1',
    lat: 38.0973624223452, lng: 128.406518491532,
    description: '인제와 양양을 잇는 44번 국도 한계령 정상에 있는 휴게소예요. 해발 1,000m가 넘는 고갯길이라 라이더들이 와인딩 코스로 즐겨 찾고 휴게소에서는 설악산 능선 전망이 시원하게 열려요.',
    tags: ['휴게소', '한계령', '와인딩', '설악산'],
  },
  {
    name: '대관령마을휴게소',
    category: 'rest_stop',
    address: '강원특별자치도 평창군 대관령면 경강로 5721',
    lat: 37.6851472240835, lng: 128.754514401668,
    description: '옛 영동고속도로였던 456번 지방도 대관령 옛길 정상에 있는 휴게소예요. 굽이진 옛길을 올라온 라이더와 여행객이 쉬어가는 곳이고 선자령 등산로와 양떼목장 입구가 바로 옆이에요.',
    tags: ['휴게소', '대관령옛길', '평창'],
  },
  {
    name: '만항재',
    category: 'viewpoint',
    address: '강원특별자치도 정선군 고한읍 함백산로 865',
    lat: 37.1485405361634, lng: 128.898965056972,
    description: '정선, 태백, 영월 경계에 걸친 해발 1,330m 고개로 국내 포장도로 고개 중 가장 높아요. S자 커브가 이어지는 오르막 라이딩 코스로 유명하고 정상에 쉼터와 하늘숲공원이 있어요.',
    tags: ['뷰포인트', '정선', '와인딩'],
  },
  {
    name: '미시령 옛길 정상',
    category: 'viewpoint',
    address: '강원특별자치도 고성군 토성면 미시령옛길 383',
    lat: 38.214900783174, lng: 128.438463463886,
    description: '인제 용대리에서 고성, 속초로 넘어가는 미시령 옛길의 정상이에요. 2024년 5월 차량 통행 제한이 해제돼 다시 달릴 수 있고 정상에서 속초 시내와 동해가 내려다보여요.',
    tags: ['뷰포인트', '미시령', '속초'],
  },
  // 충청·전라 6
  {
    name: '하이치치',
    category: 'cafe',
    address: '충남 당진시 신평면 삽교천길 21',
    lat: 36.8835573754427, lng: 126.818065531163,
    description: '삽교호 앞에 자리한 모터사이클 테마 카페예요. 바이크 100대는 거뜬히 세울 수 있는 넓은 주차장이 있어 서해 라이딩 중 쉬어가기 좋아요. 아몬드 크림라떼가 시그니처 메뉴예요.',
    tags: ['바이크카페', '당진', '삽교호'],
  },
  {
    name: '바이크월드',
    category: 'gear_shop',
    address: '충북 청주시 흥덕구 가로수로 1099',
    lat: 36.6267969975129, lng: 127.418959291636,
    description: '4개 층 1,500평 규모의 국내 최대급 바이크 멀티샵이에요. 가와사키를 비롯한 여러 브랜드 차량과 헬멧, 안전장비를 한자리에서 볼 수 있어요. 1층에는 커피를 마시며 쉬어갈 수 있는 카페 공간도 있어요.',
    tags: ['용품점', '청주', '멀티샵'],
  },
  {
    name: '바이크마트 청주점',
    category: 'gear_shop',
    address: '충북 청주시 청원구 중앙로256번길 9',
    lat: 36.6798631658384, lng: 127.483479341219,
    description: '헬멧과 자켓, 부츠 같은 라이딩 기어를 직접 시착해 보고 살 수 있는 오토바이용품 직영 매장이에요. 무료 주차 공간과 내부 화장실을 갖춰 청주 라이딩 길에 편하게 들를 수 있어요.',
    tags: ['용품점', '청주', '직영점'],
  },
  {
    name: '성삼재휴게소',
    category: 'rest_stop',
    address: '전남 구례군 광의면 노고단로 1068',
    lat: 35.30605363493139, lng: 127.51039411794775,
    description: '해발 1,102m 성삼재 정상에 있는 휴게소예요. 861번 지방도의 굽잇길을 올라야 닿는 곳이라 와인딩 명소로 꼽혀요. 지리산 능선과 사계절 각기 다른 풍경을 한눈에 담을 수 있어요.',
    tags: ['휴게소', '지리산', '와인딩', '구례'],
  },
  {
    name: '정령치휴게소',
    category: 'viewpoint',
    address: '전북 남원시 산내면 정령치로 1523',
    lat: 35.3638177772989, lng: 127.52227701523,
    description: '해발 1,172m 고개 정상까지 도로로 오를 수 있는 지리산 고갯길이에요. 급경사와 급커브가 이어지는 정령치로는 와인딩 코스로 명성이 자자해요. 정상 전망대에서 지리산 능선이 파노라마로 펼쳐져요.',
    tags: ['뷰포인트', '지리산', '와인딩', '남원'],
  },
  {
    name: '바이크나라',
    category: 'repair_shop',
    address: '전북 전주시 덕진구 권삼득로 106',
    lat: 35.8303367808967, lng: 127.143411787948,
    description: '전주에서 오토바이 판매와 정비, 중고 매입까지 한 번에 해결할 수 있는 바이크샵이에요. CFMOTO 차량과 헬멧, 자켓 같은 용품도 취급해요. 전북 라이딩 중 정비가 필요할 때 들르기 좋아요.',
    tags: ['정비소', '전주', '용품'],
  },
  // 경상·제주 7
  {
    name: '필립상회 & 카페 1.14km',
    category: 'cafe',
    address: '대구광역시 중구 북성로 59-1',
    lat: 35.8740244705377, lng: 128.588951324613,
    description: '북성로의 클래식 바이크 용품점 필립상회와 라이더 카페 1.14km가 한 건물에 있어요. 1층은 카페, 2층은 벨헬멧 등 클래식 장비를 다루는 용품점이에요. 대구 라이더들의 모임 장소로 알려져 있어요.',
    tags: ['바이크카페', '대구', '클래식'],
  },
  {
    name: '로밍온앤오프 & 롤링하츠',
    category: 'cafe',
    address: '대구광역시 동구 팔공산로 1518',
    lat: 35.9680181526919, lng: 128.699656215979,
    description: '대구 팔공산로에 있는 라이더 카페 겸 편집숍이에요. 2층 카페에서는 시그니처 메뉴 롤링 슈페너를 팔고 벨스타프 공식수입사가 클래식 모터사이클 의류를 함께 선보여요. 1층엔 바이크 콘셉트 촬영 스튜디오가 있어요.',
    tags: ['바이크카페', '대구', '팔공산'],
  },
  {
    name: '열화커피',
    category: 'cafe',
    address: '경상북도 고령군 다산면 다산로 690',
    lat: 35.8225200185068, lng: 128.453219375411,
    description: '오토바이 테마로 꾸민 카페로 여성 라이더 사장님이 운영해요. 매장 안팎에 바이크와 라이딩 사진, 피규어가 전시돼 있어요. 아침 7시에 문을 열어 이른 출발 전에 들르기 좋고 월요일은 쉬어요.',
    tags: ['바이크카페', '고령', '아침영업'],
  },
  {
    name: '한티휴게소',
    category: 'rest_stop',
    address: '경상북도 칠곡군 동명면 한티로 1245',
    lat: 36.0205430470198, lng: 128.629960378183,
    description: '팔공산 한티재 정상에 자리한 고갯길 휴게소예요. 와인딩 코스로 유명한 한티재를 넘는 라이더들이 쉬어가는 단골 쉼터예요. 1994년부터 같은 자리를 지키고 있어요.',
    tags: ['휴게소', '한티재', '와인딩', '팔공산'],
  },
  {
    name: '루트세븐 레저타운',
    category: 'cafe',
    address: '경상북도 포항시 북구 송라면 동해대로 3166',
    lat: 36.2463921865919, lng: 129.371170267085,
    description: '동해안 7번 국도 화진해수욕장 인근의 오토캠핑장 겸 레저타운이에요. 단지 안 카페 클럽하우스에서 커피 한잔하며 쉬어갈 수 있어요. 동해안 라이딩 중 들르는 라이더들의 방문 후기가 이어지는 곳이에요.',
    tags: ['바이크카페', '포항', '7번국도', '캠핑'],
  },
  {
    name: '친봉산장',
    category: 'cafe',
    address: '제주특별자치도 서귀포시 하신상로 417',
    lat: 33.2911344241448, lng: 126.596073965029,
    description: '5.16도로 끝자락 돈내코 인근의 산장 콘셉트 카페예요. 바이크 전용 주차장이 있고 실내엔 벽난로와 가죽 소파가 있어 라이딩 후 쉬기 좋아요. 아이리쉬커피가 대표 메뉴로 꼽혀요.',
    tags: ['바이크카페', '제주', '산장'],
  },
  {
    name: '1100고지 휴게소',
    category: 'rest_stop',
    address: '제주특별자치도 서귀포시 1100로 1555',
    lat: 33.3578491473629, lng: 126.46242448237,
    description: '제주 1100도로 가장 높은 지점에 있는 휴게소예요. 한라산을 가까이 조망할 수 있고 건너편에는 람사르 습지 산책로가 있어요. 라이딩 중 간단한 식사와 커피로 쉬어가기 좋아요.',
    tags: ['휴게소', '제주', '1100도로', '한라산'],
  },
];

// ---------------------------------------------------------------------------
// 코스 8개 — 경유지는 카카오 키워드 검색 최상위 매칭으로 좌표 해석 (사전 검증 완료)
// ---------------------------------------------------------------------------
const COURSES = [
  {
    name: '설악 미시령-한계령 와인딩 코스',
    description: '인제 원통에서 미시령 옛길을 넘어 속초 바다로 내려간 뒤 한계령휴게소까지 오르는 설악 고갯길 코스예요. 연속 헤어핀과 급경사가 이어지는 국내 대표 와인딩 구간이라 경험 있는 라이더에게 어울려요. 여름엔 시원한 산바람, 가을엔 단풍이 절정이에요.',
    distance: 86, duration: 115, difficulty: 'hard',
    tags: ['와인딩', '고갯길', '단풍'],
    waypoints: ['원통버스터미널', '미시령', '설악해맞이공원', '한계령휴게소'],
  },
  {
    name: '동해안 7번 국도 헌화로 코스',
    description: '강릉 안목해변 커피거리에서 정동진을 지나 동해 추암 촛대바위까지 7번 국도 바닷길을 달리는 코스예요. 심곡항에서 금진해변으로 이어지는 헌화로는 바다와 도로가 거의 붙어 있어 파도가 바로 옆에서 부서져요. 파도가 높은 날엔 통제될 수 있으니 날씨를 확인하고 가세요.',
    distance: 60, duration: 90, difficulty: 'easy',
    tags: ['해안', '바다', '동해안'],
    waypoints: ['안목해변', '정동진역', '심곡항', '추암촛대바위'],
  },
  {
    name: '지리산 성삼재-정령치 코스',
    description: '구례 천은사에서 861번 지방도를 타고 해발 1,102m 성삼재휴게소까지 오르는 코스예요. 달궁계곡을 지나 정령치휴게소를 넘어 남원 광한루원으로 내려와요. 급경사와 연속 코너가 이어지는 산악 와인딩이라 충분히 쉬어가며 타는 게 좋고 겨울엔 결빙으로 통행이 제한되기도 해요.',
    distance: 41, duration: 85, difficulty: 'hard',
    tags: ['와인딩', '산악', '지리산'],
    waypoints: ['천은사', '성삼재휴게소', '정령치휴게소', '광한루원'],
  },
  {
    name: '남해 물미해안도로 코스',
    description: '남해대교를 건너 섬을 시계 반대 방향으로 도는 해안 코스예요. 가천 다랭이마을의 계단식 논과 미조항 포구를 지나 물미해안도로로 이어져요. 미조항에서 물건리까지 약 15km 구간은 한려해상의 비단길이라 불릴 만큼 바다 경치가 좋아요. 종점 독일마을에서 쉬어가기 좋아요.',
    distance: 81, duration: 125, difficulty: 'medium',
    tags: ['해안', '바다', '남해'],
    waypoints: ['남해대교', '가천다랭이마을', '미조항 북항', '물미해안전망대', '남해독일마을'],
  },
  {
    name: '제주 일주 코스',
    description: '제주공항에서 시계 반대 방향으로 섬을 도는 일주 코스예요. 협재 바다와 송악산, 성산일출봉을 거쳐 함덕해수욕장까지 1132번 일주도로와 해안도로를 넘나들며 달려요. 하루를 꽉 채우는 장거리 코스라 중간중간 쉬어가며 여유 있게 도는 걸 추천해요.',
    distance: 186, duration: 270, difficulty: 'medium',
    tags: ['일주', '해안', '장거리'],
    waypoints: ['제주국제공항', '협재해수욕장', '송악산 주차장', '성산일출봉 주차장', '함덕해수욕장'],
  },
  {
    name: '하동 섬진강 벚꽃길 코스',
    description: '구례구역에서 섬진강을 따라 19번 국도로 하동까지 내려가는 강변 코스예요. 화개장터에서 쌍계사까지 약 6km 십리벚꽃길은 벚나무 1100여 그루가 꽃터널을 이루는 봄 라이딩 명소예요. 벚꽃은 보통 3월 말에서 4월 초가 절정이에요. 악양 최참판댁과 하동송림을 지나 느긋하게 마무리하기 좋아요.',
    distance: 58, duration: 90, difficulty: 'easy',
    tags: ['벚꽃', '강변', '봄'],
    waypoints: ['구례구역', '화개장터', '하동 쌍계사', '최참판댁', '하동송림공원'],
  },
  {
    name: '변산반도 해안 코스',
    description: '새만금방조제 끝에서 30번 국도를 타고 변산반도 해안을 도는 코스예요. 변산해수욕장과 채석강의 퇴적층 절벽을 지나 내소사, 곰소항까지 바다와 갯벌 풍경이 이어져요. 큰 고개 없이 완만한 해안 길이라 초보 라이더도 부담 없이 즐기기 좋아요.',
    distance: 42, duration: 70, difficulty: 'easy',
    tags: ['해안', '초보', '서해안'],
    waypoints: ['새만금홍보관', '변산해수욕장', '채석강', '내소사', '곰소항'],
  },
  {
    name: '영남알프스 얼음골-배내골 코스',
    description: '울주 석남사에서 24번 국도로 석남터널을 넘어 밀양 얼음골로 내려가는 영남알프스 코스예요. 터널을 지나면 급커브 내리막이 이어지니 속도를 줄여 달리는 게 좋아요. 표충사와 밀양댐 호반을 지나 배내골 계곡길을 거슬러 배내고개까지 올라요. 부산과 경남 라이더들이 즐겨 찾는 근교 명소예요.',
    distance: 65, duration: 95, difficulty: 'medium',
    tags: ['와인딩', '계곡', '영남알프스'],
    waypoints: ['석남사', '영남알프스 얼음골케이블카', '밀양 표충사', '배내고개'],
  },
];

// ---------------------------------------------------------------------------

async function kakaoKeyword(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword?query=${encodeURIComponent(query)}&size=1`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!res.ok) throw new Error(`카카오 검색 실패 ${res.status}: ${await res.text()}`);
  const doc = (await res.json()).documents[0];
  if (!doc) throw new Error(`카카오 검색 결과 없음: ${query}`);
  return { longitude: Number(doc.x), latitude: Number(doc.y), matched: doc.place_name };
}

async function alreadyExists(table, name) {
  const params = new URLSearchParams({ select: 'id', name: `eq.${name}`, limit: '1' });
  const res = await fetch(`${REST}/${table}?${params}`, { headers: SUPA_HEADERS });
  if (!res.ok) throw new Error(`조회 실패 ${res.status}: ${await res.text()}`);
  return (await res.json()).length > 0;
}

async function insert(table, payload) {
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`INSERT 실패 ${res.status}: ${await res.text()}`);
}

async function main() {
  let ok = 0, skip = 0, fail = 0;

  console.log(`[INFO] 장소 ${PLACES.length}곳 시드 시작`);
  for (const p of PLACES) {
    try {
      if (await alreadyExists('places', p.name)) {
        console.log(`[SKIP] ${p.name}`);
        skip++;
        continue;
      }
      await insert('places', {
        name: p.name,
        description: p.description,
        category: p.category,
        location: `POINT(${p.lng} ${p.lat})`,
        address: p.address,
        tags: p.tags,
        approved: true,
      });
      console.log(`[OK]   ${p.name}  (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`);
      ok++;
    } catch (e) {
      console.error(`[FAIL] ${p.name}: ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n[INFO] 코스 ${COURSES.length}개 시드 시작`);
  for (const c of COURSES) {
    try {
      if (await alreadyExists('courses', c.name)) {
        console.log(`[SKIP] ${c.name}`);
        skip++;
        continue;
      }
      const coords = [];
      for (const q of c.waypoints) {
        const { longitude, latitude, matched } = await kakaoKeyword(q);
        coords.push([longitude, latitude]);
        console.log(`       · ${q} → ${matched}`);
        await new Promise(r => setTimeout(r, 120));
      }
      await insert('courses', {
        name: c.name,
        description: c.description,
        distance: c.distance,
        duration: c.duration,
        difficulty: c.difficulty,
        coordinates: coords,
        tags: c.tags,
        approved: true,
      });
      console.log(`[OK]   ${c.name}  (경유지 ${coords.length}개)`);
      ok++;
    } catch (e) {
      console.error(`[FAIL] ${c.name}: ${e.message}`);
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

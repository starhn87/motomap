// 카테고리별 지도 마커 PNG 생성 — 카테고리색 물방울 핀 + 흰 원 배지 + 채움형
// 벡터 심벌(카테고리색) + 흰 외곽선. 이모지 마커가 작게 뭉개져 보이던 것을 대체한다.
// 사용: node scripts/generate-markers.mjs  →  assets/images/markers/*.png (@3x)

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'images', 'markers');
mkdirSync(outDir, { recursive: true });

// constants/categories.ts 와 동일한 색
const CATEGORIES = {
  cafe: '#A16207',
  restaurant: '#EF4444',
  rest_stop: '#3B82F6',
  gas_station: '#22C55E',
  repair_shop: '#8B5CF6',
  viewpoint: '#EC4899',
  gear_shop: '#0EA5E9',
  camping: '#F97316',
  car_wash: '#14B8A6',
  // 일반 장소(카카오 임시 핀) — 카테고리 없음, 중립 슬레이트
  general: '#475569',
};

// 채움형 심벌 패스 (24x24 뷰박스, Material Icons 계열)
const ICONS = {
  cafe: 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4v-2z',
  restaurant:
    'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
  rest_stop:
    'M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z',
  gas_station:
    'M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
  repair_shop:
    'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
  viewpoint:
    'M12 15.2c1.77 0 3.2-1.43 3.2-3.2S13.77 8.8 12 8.8 8.8 10.23 8.8 12s1.43 3.2 3.2 3.2zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
  gear_shop:
    'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm0 6c-1.1 0-2-.9-2-2H8c0 2.21 1.79 4 4 4s4-1.79 4-4h-2c0 1.1-.9 2-2 2z',
  camping: 'M12 3 L23 20 H15.2 L12 14.6 L8.8 20 H1 Z',
  car_wash:
    'M17 5c.83 0 1.5-.67 1.5-1.5 0-1-1.5-2.7-1.5-2.7s-1.5 1.7-1.5 2.7c0 .83.67 1.5 1.5 1.5zm-5 0c.83 0 1.5-.67 1.5-1.5 0-1-1.5-2.7-1.5-2.7s-1.5 1.7-1.5 2.7c0 .83.67 1.5 1.5 1.5zM7 5c.83 0 1.5-.67 1.5-1.5C8.5 2.5 7 .8 7 .8S5.5 2.5 5.5 3.5C5.5 4.33 6.17 5 7 5zm11.92 3.01C18.72 7.42 18.16 7 17.5 7h-11c-.66 0-1.21.42-1.42 1.01L3 14v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 18c-.83 0-1.5-.67-1.5-1.5S5.67 15 6.5 15s1.5.67 1.5 1.5S7.33 18 6.5 18zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 13l1.5-4.5h11L19 13H5z',
  general: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
};

// 원 + 짧은 꼬리(네이버 지도식): 온전한 원에 아래로 꼬리만 돋는다. 선택 전
// 원형 마커와 형태가 이어지고, 물방울보다 어깨가 안 뭉툭하다.
// 꼬리는 원의 접선 방향으로 출발하는 2차 베지어 — 직선으로 꺾으면 원과
// 만나는 지점에 각이 보인다(접선 연속이라야 이음새가 사라진다).
const PIN_PATH =
  'M 11 31.23 A 16 16 0 1 1 29 31.23 Q 22.39 35.73 20 42 Q 17.61 35.73 11 31.23 Z';

const ICON_SCALE = 0.75; // 24x24 아이콘을 배지(직경 26) 안에 — 아이콘 18px
const BADGE_CX = 20;
const BADGE_CY = 18;

// 즐겨찾기 별 (Material star, 24x24) — 아이콘 자리를 별이 차지한다.
// 흰색이면 다른 카테고리 아이콘과 한눈에 안 갈려서 노란색으로 뺀다(앱의 별 색).
const STAR_FILL = '#FACC15';
const STAR_PATH =
  'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

for (const [category, color] of Object.entries(CATEGORIES)) {
  const tx = BADGE_CX - 12 * ICON_SCALE;
  const ty = BADGE_CY - 12 * ICON_SCALE;
  // 네이버 마커의 기본 앵커는 하단 중앙(0.5, 1) — 꼬리 끝이 곧 좌표이므로
  // 캔버스는 핀에 꽉 차게 만든다.
  // 원형 마커와 같은 배색 — 색을 채우고 아이콘을 흰색으로 뺀다. 선택되면
  // 크기·형태(꼬리)가 이미 바뀌므로 색까지 반전시킬 이유가 없다.
  const pin = (iconPath, iconFill = '#FFFFFF') => `
  <path d="${PIN_PATH}" fill="${color}" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round"/>
  <g transform="translate(${tx} ${ty}) scale(${ICON_SCALE})">
    <path d="${iconPath}" fill="${iconFill}"/>
  </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46" width="120" height="138">${pin(ICONS[category])}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, `${category}.png`));
  console.log(`${category}.png 생성`);

  // 원형 변형 — 선택되지 않은 마커는 전부 이걸 쓴다(지도 탭·검색 결과 지도).
  // 핀보다 차지 면적이 절반 이하라 마커가 몰린 지역도 덜 답답하고 캡션 놓을
  // 자리가 넉넉해진다. 색을 채우고 아이콘을 흰색으로 빼야 작아져도 구분된다.
  const circle = (iconPath, iconFill = '#FFFFFF') => {
    const s = 0.62; // 24x24 아이콘 → 약 15px
    const t = 18 - 12 * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="108" height="108">
  <circle cx="18" cy="18" r="14" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
  <g transform="translate(${t} ${t}) scale(${s})">
    <path d="${iconPath}" fill="${iconFill}"/>
  </g>
</svg>`;
  };
  await sharp(Buffer.from(circle(ICONS[category]))).png().toFile(join(outDir, `${category}_circle.png`));
  console.log(`${category}_circle.png 생성`);

  // 즐겨찾기 변형 — 같은 핀에서 카테고리 아이콘 대신 별.
  // 일반 장소(general)도 만든다 — 등록 장소가 아니어도 즐겨찾기할 수 있다.
  // 색은 중립 슬레이트 그대로라 "라이더 장소가 아님"이 색으로 구분된다.
  const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46" width="120" height="138">${pin(STAR_PATH, STAR_FILL)}
</svg>`;
  await sharp(Buffer.from(favSvg)).png().toFile(join(outDir, `${category}_fav.png`));
  await sharp(Buffer.from(circle(STAR_PATH, STAR_FILL))).png().toFile(join(outDir, `${category}_circle_fav.png`));
  console.log(`${category}_fav.png / _circle_fav.png 생성`);
}

// 내 위치 마커 — UserLocationMarker 가 children(뷰 캡처) 대신 쓰는 정적 이미지.
// 캡처 마커는 캡처용 네이티브 뷰가 고아로 남아 화면을 떠도는 잔상 버그가 있는데
// (CLAUDE.md), 위치 마커는 위치 갱신마다 다시 그려져 가장 잘 걸린다 — 실기기
// 길안내 화면 위에 뜬 잔상으로 재확인(2026-08). 기존 뷰 구성(halo·흰 테두리
// 도트·방향 화살표, 80dp)을 그대로 재현한다. @3x = 240px.
const USER_BLUE = '#2D8CFF';
const userLocationSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="240" height="240">
  <defs>
    <filter id="dotShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
      <feOffset dy="1"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="40" cy="40" r="20" fill="rgba(45,140,255,0.18)"/>
  <path d="M40 18 L47 30 L33 30 Z" fill="#FFFFFF"/>
  <path d="M40 21 L44 28 L36 28 Z" fill="${USER_BLUE}"/>
  <g filter="url(#dotShadow)">
    <circle cx="40" cy="40" r="9" fill="#FFFFFF"/>
    <circle cx="40" cy="40" r="6" fill="${USER_BLUE}"/>
  </g>
</svg>`;
await sharp(Buffer.from(userLocationSvg)).png().toFile(join(outDir, 'user_location.png'));
console.log('user_location.png 생성');
console.log('완료');

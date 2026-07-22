// 카테고리별 지도 마커 PNG 생성 — 카테고리색 물방울 핀 + 흰 원 배지 + 채움형
// 벡터 심벌(카테고리색) + 흰 외곽선. 이모지 마커가 작게 뭉개져 보이던 것을 대체한다.
// 사용: node scripts/generate-markers.mjs  →  assets/images/markers/*.png (@3x, 144x180)

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
  general: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
};

// 슬림 물방울 핀 (40x56 뷰박스): 폭 36 원형 상단 + 아래로 뾰족한 꼬리, 흰 외곽선
const PIN_PATH =
  'M20 1.5 C9.8 1.5 2 9.3 2 19 C2 26.8 8 33.5 20 54.5 C32 33.5 38 26.8 38 19 C38 9.3 30.2 1.5 20 1.5 Z';

const ICON_SCALE = 0.75; // 24x24 아이콘을 배지(직경 26) 안에 — 아이콘 18px
const BADGE_CX = 20;
const BADGE_CY = 18.5;

for (const [category, color] of Object.entries(CATEGORIES)) {
  const tx = BADGE_CX - 12 * ICON_SCALE;
  const ty = BADGE_CY - 12 * ICON_SCALE;
  // 캔버스 세로 2배(하반부 투명) — 클러스터 마커는 앵커 지정이 안 되고 중앙에
  // 붙으므로, 핀을 상반부에 그리면 캔버스 중앙 = 꼬리 끝 = 좌표가 된다.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 112" width="120" height="336">
  <path d="${PIN_PATH}" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
  <circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="13" fill="#FFFFFF"/>
  <g transform="translate(${tx} ${ty}) scale(${ICON_SCALE})">
    <path d="${ICONS[category]}" fill="${color}"/>
  </g>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, `${category}.png`));
  console.log(`${category}.png 생성`);
}
console.log('완료');

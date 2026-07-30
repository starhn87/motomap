// README·앱스토어용 히어로 스크린샷 2장 생성 (각 1284x2778).
// 두 장을 이어붙인 파노라마(2568x2778)를 한 장면으로 그린 뒤 반으로 자른다 —
// 좌측: 카피 + 기능 리스트, 우측: 3D 폰 렌더가 좌하단만 1장에 걸친다.
//   node scripts/generate-hero.mjs
// 폰(scripts/assets/hero-phone.png)은 three.js 실사 렌더 — 화면 스크린샷을
// 바꾸려면 scripts/hero-phone-render/ 의 서버를 띄워 다시 뽑는다.
import sharp from 'sharp';

const W = 1284;
const H = 2778;
const PW = W * 2; // 파노라마 폭
const OUT = 'docs/screenshots';

// 기능 도트 색 (경로 혼잡도 팔레트에서 가져온 브랜드 포인트)
const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const RED = '#EF4444';

const FONT = `-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;

function panoramaSvg() {
  const features = [
    [GREEN, '라이더 맞춤 장소와 코스'],
    [AMBER, '이륜차 전용 앱 내 길안내'],
    [RED, '라이딩 날씨 · 실시간 유가'],
  ];
  // 기능 리스트는 좌측 장 하단 블록 (레퍼런스 구도)
  const featureRows = features
    .map(
      ([color, label], i) => `
      <circle cx="150" cy="${2100 + i * 150}" r="16" fill="${color}" />
      <text x="212" y="${2100 + i * 150}" dominant-baseline="central"
        font-family="${FONT}" font-size="58" font-weight="600" fill="#E7E7EA">${label}</text>`,
    )
    .join('');
  return `<svg width="${PW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="${PW}" y2="${H}"
        gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#101012" />
        <stop offset="0.55" stop-color="#1B1B1F" />
        <stop offset="1" stop-color="#26262C" />
      </linearGradient>
    </defs>
    <rect width="${PW}" height="${H}" fill="url(#bg)" />
    <!-- 카피 -->
    <text x="120" y="905" font-family="${FONT}" font-size="112" font-weight="800"
      fill="#FFFFFF">라이더를 위한</text>
    <text x="120" y="1065" font-family="${FONT}" font-size="112" font-weight="800"
      fill="${AMBER}">지도부터 길안내까지</text>
    <!-- 기능 리스트 + 마무리 문구 -->
    ${featureRows}
    <text x="120" y="2600" font-family="${FONT}" font-size="46" font-weight="500"
      fill="#9B9BA3">오늘도 안라무복, 모토맵과 함께</text>
  </svg>`;
}

async function main() {
  // 앱 아이콘 (라운드 마스크)
  const icon = await sharp('assets/images/icon.png')
    .resize(340, 340)
    .composite([
      {
        input: Buffer.from(
          '<svg width="340" height="340"><rect width="340" height="340" rx="76" fill="#fff"/></svg>',
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // three.js 실사 렌더(측면·버튼·베벨 포함)를 크게 키워 살짝 기울인다.
  // 레퍼런스 구도: 폰이 2장을 가득 채우고 하단은 화면 밖으로 잘려나가며,
  // 좌하단 부분이 1장 우하단에 걸친다.
  const rotated = await sharp('scripts/assets/hero-phone.png')
    .resize({ height: 2500 })
    .rotate(8, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(rotated).metadata();
  const phoneLeft = 950;
  const phoneTop = 500;
  const visible = await sharp(rotated)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(meta.width, PW - phoneLeft),
      height: Math.min(meta.height, H - phoneTop),
    })
    .toBuffer();

  const panorama = await sharp(Buffer.from(panoramaSvg()))
    .composite([
      { input: icon, left: 120, top: 330 },
      { input: visible, left: phoneLeft, top: phoneTop },
    ])
    .png()
    .toBuffer();

  // 반으로 잘라 두 장으로
  await sharp(panorama).extract({ left: 0, top: 0, width: W, height: H }).toFile(`${OUT}/hero-1.png`);
  await sharp(panorama).extract({ left: W, top: 0, width: W, height: H }).toFile(`${OUT}/hero-2.png`);

  console.log('hero-1.png / hero-2.png 생성 완료');
}

await main();

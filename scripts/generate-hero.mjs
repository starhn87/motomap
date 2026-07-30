// README·앱스토어용 히어로 스크린샷 2장 생성 (각 1284x2778).
// 두 장을 이어붙인 파노라마(2568x2778)를 한 장면으로 그린 뒤 반으로 자른다 —
// 좌측: 카피 + 기능 리스트, 우측: 3D 폰 목업(화이트)이 좌하단만 1장에 걸친다.
//   node scripts/generate-hero.mjs   (원근 단계는 PIL: scripts/hero-phone-3d.py)
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// 스크린샷을 화이트 바디 + 블랙 베젤 프레임에 넣은 폰 목업.
// 오른쪽 측면 두께(실버 초승달)까지 한 이미지에 그려 원근 변환을 함께 받는다.
// 2x 로 만들고 원근 스크립트가 마지막에 절반으로 줄인다(안티앨리어싱).
async function phoneMockup() {
  const s = 2;
  const shotW = 950 * s;
  const shotH = Math.round((shotW * 2778) / 1284);
  const body = 18 * s; // 화이트 바디 두께
  const bezel = 12 * s; // 화면 둘레 블랙 베젤
  const side = 26 * s; // 오른쪽 측면(두께) 폭
  const frameW = shotW + (body + bezel) * 2;
  const frameH = shotH + (body + bezel) * 2;
  const radius = 140 * s;

  const shot = await sharp(`${OUT}/02-preview.png`)
    .resize(shotW, shotH)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="${radius - body - bezel}" fill="#fff"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const frame = Buffer.from(
    `<svg width="${frameW + side}" height="${frameH}">
      <defs>
        <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#E9E9ED" />
          <stop offset="1" stop-color="#C1C1C8" />
        </linearGradient>
      </defs>
      <!-- 같은 형태를 오른쪽으로 밀어 깐 실버 면 — 겹치고 남는 초승달이 측면이 된다 -->
      <rect x="${side}" y="0" width="${frameW}" height="${frameH}" rx="${radius}" fill="url(#side)" />
      <rect width="${frameW}" height="${frameH}" rx="${radius}" fill="#F4F4F6" />
      <rect x="2" y="2" width="${frameW - 4}" height="${frameH - 4}" rx="${radius - 2}"
        fill="none" stroke="#D4D4DA" stroke-width="${2 * s}" />
      <rect x="${body}" y="${body}" width="${frameW - body * 2}" height="${frameH - body * 2}"
        rx="${radius - body}" fill="#0B0B0C" />
    </svg>`,
  );

  return sharp(frame)
    .composite([{ input: shot, left: body + bezel, top: body + bezel }])
    .png()
    .toBuffer();
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

  // 폰 목업 — 원근(화면이 카피 쪽을 향함) + 오른쪽 측면 두께 + 기울기는
  // PIL 스크립트가 입힌다 (sharp 는 원근 변환이 없다)
  const flatPath = join(tmpdir(), 'motomap-hero-phone-flat.png');
  const tiltedPath = join(tmpdir(), 'motomap-hero-phone-3d.png');
  await sharp(await phoneMockup()).toFile(flatPath);
  execFileSync('python3', ['scripts/hero-phone-3d.py', flatPath, tiltedPath]);
  const rotated = await sharp(tiltedPath).png().toBuffer();
  const meta = await sharp(rotated).metadata();

  // 폰 전체가 잘리지 않고 온전히 — 좌하단이 1장 우하단에 넉넉히 걸치고
  // 몸통 대부분은 2장에 놓인다
  const phoneLeft = 1040;
  const phoneTop = Math.round((H - meta.height) / 2);

  const panorama = await sharp(Buffer.from(panoramaSvg()))
    .composite([
      { input: icon, left: 120, top: 330 },
      { input: rotated, left: phoneLeft, top: phoneTop },
    ])
    .png()
    .toBuffer();

  // 반으로 잘라 두 장으로
  await sharp(panorama).extract({ left: 0, top: 0, width: W, height: H }).toFile(`${OUT}/hero-1.png`);
  await sharp(panorama).extract({ left: W, top: 0, width: W, height: H }).toFile(`${OUT}/hero-2.png`);

  console.log('hero-1.png / hero-2.png 생성 완료');
}

await main();

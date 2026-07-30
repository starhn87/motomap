// README·앱스토어용 히어로 스크린샷 2장 생성 (1284x2778, 좌우가 이어지는 구성).
// 1장: 다크 브랜드 배경 + 카피 + 기능 리스트, 2장: 폰 목업(교통색 미리보기).
// 교통색 경로선이 두 장을 가로질러 하나의 장면으로 이어진다.
//   node scripts/generate-hero.mjs
import sharp from 'sharp';

const W = 1284;
const H = 2778;
const OUT = 'docs/screenshots';

// 경로선 교통색 (app/navi.tsx TRAFFIC_COLORS와 동일 계열)
const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const RED = '#EF4444';

const FONT = `-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;

// 두 장에 걸치는 경로선 — 전체 폭 2568(2장) 기준 좌표로 그리고 장별로 잘라 쓴다.
// 완만한 커브가 왼쪽 아래에서 들어와 오른쪽 위로 빠져나간다.
function roadPath(offsetX) {
  const seg = (d, color, width, dash = '') => `
    <path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"
      stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}
      transform="translate(${-offsetX},0)" />`;
  // 바탕 흰 아웃라인 → 색 세그먼트 순으로 겹친다 (지도의 경로선처럼)
  const d1 = 'M -120 2700 C 500 2620, 900 2380, 1400 2210';
  const d2 = 'M 1400 2210 C 1900 2050, 2150 1800, 2400 1480';
  const d3 = 'M 2400 1480 C 2610 1230, 2680 980, 2660 700';
  return `
    ${seg(d1, '#FFFFFF', 44)}${seg(d2, '#FFFFFF', 44)}${seg(d3, '#FFFFFF', 44)}
    ${seg(d1, GREEN, 30)}
    ${seg(d2, AMBER, 30)}
    ${seg(d3, RED, 30)}
  `;
}

// 배경 — 두 장이 같은 그라데이션을 공유하도록 전체 폭 기준으로 정의
function background(offsetX) {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="${W * 2}" y2="${H}"
        gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#101012" />
        <stop offset="0.55" stop-color="#1B1B1F" />
        <stop offset="1" stop-color="#26262C" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"
      transform="translate(0,0)" />
    <g opacity="0.95">${roadPath(offsetX)}</g>
  `;
}

// ── 1장: 카피 + 기능 리스트 ─────────────────────────────────────────────
function page1Svg() {
  const features = [
    [GREEN, '라이더 맞춤 장소와 코스'],
    [AMBER, '이륜차 전용 앱 내 길안내'],
    [RED, '라이딩 날씨 · 실시간 유가'],
  ];
  const featureRows = features
    .map(
      ([color, label], i) => `
      <circle cx="150" cy="${2062 + i * 150}" r="17" fill="${color}" />
      <text x="215" y="${2062 + i * 150}" dominant-baseline="central"
        font-family="${FONT}" font-size="62" font-weight="600" fill="#E7E7EA">${label}</text>`,
    )
    .join('');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${background(0)}
    <!-- 카피 -->
    <text x="120" y="1180" font-family="${FONT}" font-size="118" font-weight="800"
      fill="#FFFFFF">라이더를 위한</text>
    <text x="120" y="1345" font-family="${FONT}" font-size="118" font-weight="800"
      fill="${AMBER}">지도부터 길안내까지</text>
    <!-- 기능 리스트 -->
    ${featureRows}
  </svg>`;
}

// ── 2장: 폰 목업 배경 ───────────────────────────────────────────────────
function page2Svg() {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${background(W)}
  </svg>`;
}

// 스크린샷을 베젤 프레임에 넣은 폰 목업 한 장을 만든다
async function phoneMockup() {
  const shotW = 940;
  const shotH = Math.round((shotW * 2778) / 1284);
  const bezel = 26;
  const frameW = shotW + bezel * 2;
  const frameH = shotH + bezel * 2;
  const radius = 130;

  const shot = await sharp(`${OUT}/02-preview.png`)
    .resize(shotW, shotH)
    .composite([
      {
        // 화면 라운드 클립
        input: Buffer.from(
          `<svg width="${shotW}" height="${shotH}"><rect x="0" y="0" width="${shotW}" height="${shotH}" rx="${radius - bezel}" fill="#fff"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const frame = Buffer.from(
    `<svg width="${frameW}" height="${frameH}">
      <rect x="0" y="0" width="${frameW}" height="${frameH}" rx="${radius}" fill="#0A0A0B" />
      <rect x="6" y="6" width="${frameW - 12}" height="${frameH - 12}" rx="${radius - 6}"
        fill="none" stroke="#3A3A40" stroke-width="3" />
    </svg>`,
  );

  return sharp(frame)
    .composite([{ input: shot, left: bezel, top: bezel }])
    .png()
    .toBuffer();
}

// ── 합성 ────────────────────────────────────────────────────────────────
async function main() {
  // 1장
  await sharp(Buffer.from(page1Svg()))
    .composite([
      {
        // 앱 아이콘 (라운드 마스크)
        input: await sharp('assets/images/icon.png')
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
          .toBuffer(),
        left: 120,
        top: 620,
      },
    ])
    .png()
    .toFile(`${OUT}/hero-1.png`);

  // 2장 — 폰을 살짝 기울여 화면 하단이 잘리게 (WOWPASS 레퍼런스 구도)
  const phone = await phoneMockup();
  const rotated = await sharp(phone)
    .rotate(-8, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(rotated).metadata();
  // 폰이 오른쪽·아래로 화면을 빠져나가는 구도 — 캔버스를 넘는 부분은 잘라 넣는다
  const left = Math.round((W - meta.width) / 2 + 60);
  const top = 700;
  const visible = await sharp(rotated)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(meta.width, W - left),
      height: Math.min(meta.height, H - top),
    })
    .toBuffer();
  await sharp(Buffer.from(page2Svg()))
    .composite([{ input: visible, left, top }])
    .png()
    .toFile(`${OUT}/hero-2.png`);

  console.log('hero-1.png / hero-2.png 생성 완료');
}

await main();

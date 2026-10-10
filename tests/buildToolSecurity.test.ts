import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { quote } = require('shell-quote') as { quote: (tokens: unknown[]) => string };

test('shell-quote는 comment 뒤의 줄바꿈 토큰을 셸 문자열로 만들지 않는다', () => {
  // 문자열 변환만 검사하며 셸로 실행하지 않는다.
  assert.throws(() => quote(['echo', 'ok', { comment: 'test' }, 'unsafe\nnext']), TypeError);
  assert.equal(typeof quote(['echo', 'safe value']), 'string');
});

test('업데이트된 이미지 도구로 SVG → PNG 크기·알파 채널을 유지한다', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="46"><circle cx="20" cy="20" r="18" fill="#22c55e"/></svg>');
  const png = await sharp(svg).resize(80, 92).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 80);
  assert.equal(metadata.height, 92);
  assert.equal(metadata.hasAlpha, true);
});

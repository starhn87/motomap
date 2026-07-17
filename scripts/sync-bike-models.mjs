// constants/bikes.ts 의 기종 목록을 moto-kr 데이터셋에서 재생성한다.
// 기종 목록의 단일 원본은 https://github.com/starhn87/moto-kr — 이 파일을 직접 고치지 말고
// moto-kr 의 mapping/ 에 기여한 뒤 이 스크립트로 동기화한다.
//
// 사용: node scripts/sync-bike-models.mjs
// 소스: 로컬 ../moto-kr 체크아웃이 있으면 그걸 쓰고, 없으면 jsDelivr CDN 에서 받는다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(root, '..', 'moto-kr', 'data', 'models.min.json');
const REMOTE = 'https://cdn.jsdelivr.net/gh/starhn87/moto-kr@main/data/models.min.json';

let dataset;
if (existsSync(LOCAL)) {
  dataset = JSON.parse(readFileSync(LOCAL, 'utf8'));
  console.log(`로컬 moto-kr 사용 (${LOCAL})`);
} else {
  const res = await fetch(REMOTE);
  if (!res.ok) throw new Error(`moto-kr 다운로드 실패: HTTP ${res.status}`);
  dataset = await res.json();
  console.log(`jsDelivr CDN 사용`);
}

const names = dataset.names;
if (!Array.isArray(names) || names.length < 500) {
  throw new Error(`데이터셋 이상: names ${names?.length}개 — 동기화 중단`);
}

const target = join(root, 'constants', 'bikes.ts');
const src = readFileSync(target, 'utf8');
const tailStart = src.indexOf('];');
if (tailStart < 0) throw new Error('bikes.ts 형식이 예상과 다릅니다');
const tail = src.slice(tailStart);

const header = `// 내 바이크 자동완성용 기종 목록 — moto-kr 데이터셋에서 생성된 파일이다.
// ⚠️ 직접 수정하지 말 것. 기종 추가·수정은 https://github.com/starhn87/moto-kr 의
// mapping/models.json 에 반영한 뒤 \`node scripts/sync-bike-models.mjs\` 로 동기화한다.
// (생성: ${dataset.meta.generatedAt}, ${names.length}종)
// 완전한 전수는 아니므로 목록에 없는 기종은 자유 입력으로 저장한다.

export const BIKE_MODELS: string[] = [
`;
const body = names.map((n) => `  '${n.replace(/'/g, "\\'")}',`).join('\n');

writeFileSync(target, header + body + '\n' + tail);
console.log(`constants/bikes.ts 재생성 — ${names.length}종`);

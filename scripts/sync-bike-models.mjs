// constants/bikes.ts 의 기종 목록·스펙을 moto-kr 데이터셋에서 재생성한다.
// 기종의 단일 원본은 https://github.com/starhn87/moto-kr — 이 파일을 직접 고치지 말고
// moto-kr 의 mapping/ 에 기여한 뒤 이 스크립트로 동기화한다.
//
// 사용: node scripts/sync-bike-models.mjs
// 소스: 로컬 ../moto-kr 체크아웃이 있으면 그걸 쓰고, 없으면 jsDelivr CDN 에서 받는다.
// models.lite.json 을 쓴다 — 이름뿐 아니라 배기량·유종·탱크 용량 등 스펙까지
// 앱이 쓰기 때문(유가 연동·내 바이크 스펙 카드).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(root, '..', 'moto-kr', 'data', 'models.lite.json');
const REMOTE = 'https://cdn.jsdelivr.net/gh/starhn87/moto-kr@main/data/models.lite.json';

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

const models = dataset.models;
if (!Array.isArray(models) || models.length < 500) {
  throw new Error(`데이터셋 이상: models ${models?.length}개 — 동기화 중단`);
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// 앱이 실제로 쓰는 필드만 담는다 — 전부 옵션(채움률 65~80%)
const specLine = (m) => {
  const parts = [];
  if (m.displacement) parts.push(`cc: ${m.displacement}`);
  if (m.category) parts.push(`category: '${esc(m.category)}'`);
  if (m.fuelGrade) parts.push(`fuelGrade: '${m.fuelGrade}'`);
  if (m.fuelCapacity) parts.push(`tankL: ${m.fuelCapacity}`);
  if (m.seatHeight) parts.push(`seatMm: ${m.seatHeight}`);
  if (m.weight) parts.push(`weightKg: ${m.weight}`);
  if (m.power) parts.push(`powerPs: ${m.power}`);
  if (m.electric) parts.push(`electric: true`);
  if (parts.length === 0) return null;
  return `  '${esc(m.nameKo)}': { ${parts.join(', ')} },`;
};

const names = models.map((m) => `  '${esc(m.nameKo)}',`).join('\n');
const specLines = models.map(specLine).filter(Boolean);
const normalize = (s) => s.trim().toLowerCase().replace(/[\s·._-]+/g, '');
const searchLines = models.map((m) => {
  const terms = [
    ...new Set([m.nameKo, m.model, ...(m.aliases ?? [])].map(normalize).filter(Boolean)),
  ];
  return `  ['${esc(m.nameKo)}', '${esc(terms.join(' '))}'],`;
});

const out = `// 내 바이크 기종 목록·스펙 — moto-kr 데이터셋에서 생성된 파일이다.
// ⚠️ 직접 수정하지 말 것. 기종 추가·수정은 https://github.com/starhn87/moto-kr 의
// mapping/models.json 에 반영한 뒤 \`node scripts/sync-bike-models.mjs\` 로 동기화한다.
// (생성: ${dataset.meta.generatedAt}, ${models.length}종 / 스펙 ${specLines.length}종)
// 완전한 전수는 아니므로 목록에 없는 기종은 자유 입력으로 저장한다.

export const BIKE_MODELS: string[] = [
${names}
];

/** 기종 스펙 — 인증 데이터 기반이라 필드가 비어 있는 기종도 있다(빈 항목은 생략) */
export interface BikeSpec {
  /** 배기량(cc) */
  cc?: number;
  /** 유형 — 스쿠터·네이키드 등 (moto-kr category 원문) */
  category?: string;
  /** 권장 유종 — premium 이면 고급휘발유 */
  fuelGrade?: 'regular' | 'premium';
  /** 연료탱크 용량(L) */
  tankL?: number;
  /** 시트고(mm) */
  seatMm?: number;
  /** 중량(kg) */
  weightKg?: number;
  /** 최고출력(PS) */
  powerPs?: number;
  electric?: boolean;
}

export const BIKE_SPECS: Record<string, BikeSpec> = {
${specLines.join('\n')}
};

// 인증 데이터의 표기 별칭을 검색과 저장 정규화에 함께 쓴다. 예를 들어
// "BMW C 400 GT"를 찾아도 화면과 DB에는 canonical 이름 "BMW C400GT"가 남는다.
const BIKE_SEARCH_INDEX: [model: string, normalizedTerms: string][] = [
${searchLines.join('\n')}
];

function normalizeBikeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/[\\s·._-]+/g, '');
}

/** 정확한 이름·별칭이면 canonical 기종명을, 자유 입력이면 null을 반환한다. */
export function canonicalBikeModel(value: string): string | null {
  const q = normalizeBikeTerm(value);
  if (!q) return null;
  let found: string | null = null;
  for (const [model, terms] of BIKE_SEARCH_INDEX) {
    const exact =
      terms === q ||
      terms.startsWith(q + ' ') ||
      terms.endsWith(' ' + q) ||
      terms.includes(' ' + q + ' ');
    if (!exact) continue;
    if (found && found !== model) return null;
    found = model;
  }
  return found;
}

// 이름·별칭의 공백·대소문자 무시 부분 일치 검색 (canonical 이름, 최대 limit개)
export function searchBikeModels(query: string, limit = 15): string[] {
  const q = normalizeBikeTerm(query);
  if (!q || limit <= 0) return [];
  const results: string[] = [];
  for (const [model, terms] of BIKE_SEARCH_INDEX) {
    if (!terms.includes(q)) continue;
    results.push(model);
    if (results.length >= limit) break;
  }
  return results;
}
`;

writeFileSync(join(root, 'constants', 'bikes.ts'), out);
console.log(`constants/bikes.ts 재생성 — ${models.length}종, 스펙 ${specLines.length}종`);

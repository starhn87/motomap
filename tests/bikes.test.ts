import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalBikeModel, searchBikeModels } from '@/constants/bikes';

test('기종 별칭과 영문 표기를 canonical 이름으로 바꾼다', () => {
  assert.equal(canonicalBikeModel('r1250gs'), 'BMW R1250GS');
  assert.equal(canonicalBikeModel('BMW R1250GS Adventure'), 'BMW R1250GS어드벤처');
  assert.equal(canonicalBikeModel('없는 자유 입력 기종'), null);
});

test('검색은 canonical 이름을 중복 없이 제한 개수만 반환한다', () => {
  const results = searchBikeModels('nmax', 2);
  assert.deepEqual(results, ['야마하 NMAX125', '야마하 NMAX155']);
  assert.equal(new Set(results).size, results.length);
});

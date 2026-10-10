import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGAL_DOCS, LEGAL_OPERATOR } from '../constants/legal';

test('앱·웹 공통 법률 문서의 운영 주체는 확인된 상호와 대표자로 일치한다', () => {
  assert.equal(LEGAL_OPERATOR.tradeName, '모토맵');
  assert.equal(LEGAL_OPERATOR.representative, '이승우');
  for (const document of Object.values(LEGAL_DOCS)) {
    assert.ok(document.content.includes(`${LEGAL_OPERATOR.tradeName}(대표: ${LEGAL_OPERATOR.representative}`));
    assert.ok(document.content.includes(`사업장 주소: ${LEGAL_OPERATOR.businessAddress}`));
    assert.ok(document.content.includes(`전화번호: ${LEGAL_OPERATOR.contactPhone}`));
    assert.ok(document.content.includes(`문의 이메일: ${LEGAL_OPERATOR.contactEmail}`));
    assert.ok(!document.content.includes('${LEGAL_OPERATOR'));
  }
});

test('개인정보·위치정보 문의는 같은 책임자와 이메일로 연결한다', () => {
  for (const type of ['privacy', 'location'] as const) {
    assert.ok(LEGAL_DOCS[type].content.includes(`보호책임자: ${LEGAL_OPERATOR.representative}`));
    assert.ok(LEGAL_DOCS[type].content.includes(`연락처: ${LEGAL_OPERATOR.contactEmail}`));
  }
});

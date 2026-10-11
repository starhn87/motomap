import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGAL_DOCS, LEGAL_RELAUNCH_DOCS, LEGAL_PUBLICATION, LEGAL_RELAUNCH_READY,
  LEGAL_OPERATOR } from '../constants/legal';
import { LAST_PUBLISHED_LEGAL_DOCS } from '../constants/legal-history';
import { legalPublicationErrors } from '../lib/legalPublication';

test('앱·웹 공통 법률 문서의 운영 주체는 확인된 상호와 대표자로 일치한다', () => {
  assert.equal(LEGAL_OPERATOR.tradeName, '모토맵');
  assert.equal(LEGAL_OPERATOR.representative, '이승우');
  for (const document of Object.values(LEGAL_RELAUNCH_DOCS)) {
    assert.ok(document.content.includes(`${LEGAL_OPERATOR.tradeName}(대표: ${LEGAL_OPERATOR.representative}`));
    assert.ok(document.content.includes(`사업장 주소: ${LEGAL_OPERATOR.businessAddress}`));
    assert.ok(document.content.includes(`전화번호: ${LEGAL_OPERATOR.contactPhone}`));
    assert.ok(document.content.includes(`문의 이메일: ${LEGAL_OPERATOR.contactEmail}`));
    assert.ok(!document.content.includes('${LEGAL_OPERATOR'));
  }
});

test('개인정보·위치정보 문의는 같은 책임자와 이메일로 연결한다', () => {
  for (const type of ['privacy', 'location'] as const) {
    assert.ok(LEGAL_RELAUNCH_DOCS[type].content.includes(`보호책임자: ${LEGAL_OPERATOR.representative}`));
    assert.ok(LEGAL_RELAUNCH_DOCS[type].content.includes(`연락처: ${LEGAL_OPERATOR.contactEmail}`));
  }
});

test('승인한 10월 11일 시행 문서를 적용하고 과거 본문은 그대로 보존한다', () => {
  assert.equal(LEGAL_PUBLICATION.status, 'active');
  assert.equal(LEGAL_PUBLICATION.effectiveDate, '2026-10-11');
  assert.equal(LEGAL_PUBLICATION.consentVersion, '2026-10-11');
  assert.equal(LEGAL_RELAUNCH_READY, true);
  assert.equal(LEGAL_DOCS, LEGAL_RELAUNCH_DOCS);
  for (const document of Object.values(LEGAL_RELAUNCH_DOCS)) {
    assert.match(document.content, /시행일: 2026-10-11/);
    assert.doesNotMatch(document.content, /2026년 8월 18일부터 시행됩니다|시행일: 2026년 8월 18일/);
  }
  for (const document of Object.values(LAST_PUBLISHED_LEGAL_DOCS)) assert.match(document.content, /2026년 8월 18일/);
});

test('개정안은 검색어 전송과 위치 기록·집/회사 표시 제외를 실제 처리대로 구분한다', () => {
  const privacy = LEGAL_RELAUNCH_DOCS.privacy.content;
  assert.match(privacy, /네이버클라우드 API HUB/);
  assert.match(privacy, /현재 위치·지도 중심·반경·계정 식별자를 전달하지 않습니다/);
  assert.match(privacy, /집·회사.*방문 기록도 저장될 수/);
  assert.match(LEGAL_RELAUNCH_DOCS.location.content, /본인의 위치정보 관리 화면에서 열람·삭제할 수 있습니다/);
});

test('기능 이용 기록과 이용자 지정 제3자 제공의 동의·즉시 통지를 구분한다',()=>{
  const location=LEGAL_RELAUNCH_DOCS.location.content;
  assert.match(location,/기능 요청의 공급자·목적·시각·요청 결과는 확인자료에서 열람/);
  assert.match(location,/이용자가 지정한 제3자.*별도 동의.*매회 제공받는 자·제공일시·제공목적을 즉시 통보/);
  assert.doesNotMatch(location,/위치 전달 요청 시 공급자·목적·시각을 앱 화면 또는 안내 화면에 표시/);
});

test('초안 정적 검사는 통과하되 시행 준비 검사는 날짜·고지·동의 동기화를 요구한다', () => {
  assert.deepEqual(legalPublicationErrors(LEGAL_PUBLICATION), []);
  assert.deepEqual(legalPublicationErrors(LEGAL_PUBLICATION, true), []);
  assert.ok(legalPublicationErrors({ ...LEGAL_PUBLICATION, status: 'draft', effectiveDate: null,
    noticeDate: null, consentVersion: null }, true).length > 0);
  const ready = {
    ...LEGAL_PUBLICATION, status: 'active', effectiveDate: '2026-10-20', noticeDate: '2026-10-12',
    consentVersion: '2026-10-20', currentConsentVersion: '2026-10-20',
  };
  assert.deepEqual(legalPublicationErrors(ready, true), []);
  assert.ok(legalPublicationErrors({ ...ready, currentConsentVersion: '2026-08-18' }).length > 0);
  assert.ok(legalPublicationErrors({ ...ready, noticeDate: '2026-10-21' }).length > 0);
  assert.ok(legalPublicationErrors({ ...ready, effectiveDate: '2026-02-30' }).length > 0);
});

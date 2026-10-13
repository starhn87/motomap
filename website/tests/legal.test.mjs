import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import worker from '../src/index.js';
import { LEGAL_DOCS } from '../../constants/legal.ts';
import { legalDocsPlugin } from '../legalDocsPlugin.js';

const env = { ASSETS: { fetch: async () => new Response('asset') } };

test('홈페이지를 복구해도 승인된 10월 11일 정식 고지를 유지한다', async () => {
  for (const [path, type] of [['/terms', 'terms'], ['/privacy', 'privacy'], ['/location-terms', 'location']]) {
    const current = await worker.fetch(new Request(`https://motomap.kr${path}`), env);
    assert.equal(current.status, 200);
    const html = await current.text();
    assert.ok(html.includes('시행일: 2026-10-11'));
    assert.ok(!html.includes(`${path}/upcoming`));
    assert.ok(html.includes('대표자: 이승우'));
    const preview = await worker.fetch(new Request(`https://motomap.kr${path}/upcoming`), env);
    assert.equal(preview.status, 308);
    assert.equal(preview.headers.get('Location'), `https://motomap.kr${path}`);
    assert.ok(LEGAL_DOCS[type].content.includes('시행일: 2026-10-11'));
  }
  for (const path of ['/', '/place/test', '/riding/test', '/toString']) {
    assert.equal((await worker.fetch(new Request(`https://motomap.kr${path}`), env)).status, 200);
  }
});

test('법률 TS 변환은 문자열 치환 없이 현재 Vite 변환기를 사용한다', async () => {
  const id = legalDocsPlugin.resolveId('../../constants/legal.ts');
  assert.ok(id.endsWith('/constants/legal.ts'));
  const result = await legalDocsPlugin.load(id);
  assert.doesNotMatch(result.code, /export type LegalDocType| as const/);
  assert.match(result.code, /\.\.\/config\/legal-publication\.json/);
  assert.match(result.code, /\.\/legal-history/);
  // 모듈 전체 빌드가 아닌 변환된 단일 파일의 JavaScript 구문 검사다.
  const code = result.code.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  assert.doesNotThrow(() => new Script(code));
});

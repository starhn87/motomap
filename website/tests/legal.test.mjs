import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import worker from '../src/index.js';
import { LEGAL_DOCS, LEGAL_RELAUNCH_DOCS, LEGAL_DRAFT_NOTICE } from '../../constants/legal.ts';
import { legalDocsPlugin } from '../legalDocsPlugin.js';

const env = { ASSETS: { fetch: async () => new Response('asset') } };

test('현재 고지·개정안을 구분하고 홈/공유 중단은 유지한다', async () => {
  for (const [path, type] of [['/terms', 'terms'], ['/privacy', 'privacy'], ['/location-terms', 'location']]) {
    const current = await worker.fetch(new Request(`https://motomap.kr${path}`), env);
    assert.equal(current.status, 200);
    const html = await current.text();
    assert.ok(html.includes('2026년 8월 18일'));
    assert.ok(html.includes(`${path}/upcoming`));
    assert.ok(!html.includes('대표자: 이승우'));
    const preview = await worker.fetch(new Request(`https://motomap.kr${path}/upcoming`), env);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('Cache-Control'), 'no-store');
    const draft = await preview.text();
    assert.ok(draft.includes(LEGAL_DRAFT_NOTICE));
    assert.ok(draft.includes('대표자: 이승우'));
    assert.ok(draft.includes('noindex, nofollow'));
    assert.ok(draft.includes(LEGAL_RELAUNCH_DOCS[type].title));
    assert.ok(!draft.includes('2026년 8월 18일부터 시행됩니다'));
    assert.ok(LEGAL_DOCS[type].content.includes('2026년 8월 18일'));
  }
  for (const path of ['/', '/place/test', '/riding/test', '/toString']) {
    assert.equal((await worker.fetch(new Request(`https://motomap.kr${path}`), env)).status, 503);
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

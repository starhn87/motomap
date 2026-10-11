import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';
import { LEGAL_DOCS } from '../constants/legal';
import { loadModule } from './helpers/loadModule';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('AASA·앱 entitlement·라우트는 장소/구 코스/라이딩 추천 계약을 유지한다', async () => {
  const worker = loadModule<{ default: {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  } }>('website/src/index.js', {
    '../../constants/legal.ts': { LEGAL_DOCS },
    './serviceStatus.js': { serviceStatus: { status: 'suspended' } },
  }, { Response });
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  const response = await worker.default.fetch(new Request('https://motomap.kr/.well-known/apple-app-site-association'), env);
  assert.equal(response.status, 200);
  const { applinks } = await response.json();
  assert.deepEqual(applinks.details[0].appIDs, ['QD4486Q3L8.com.ridemap.app']);
  assert.deepEqual(applinks.details[0].components.map((entry: Record<string, string>) => entry['/']),
    ['/place/*', '/course/*', '/riding/*']);
  const config = read('app.config.js');
  assert.match(config, /scheme: 'ridemap'/);
  assert.match(config, /associatedDomains: \['applinks:motomap.kr'\]/);
  for (const kind of ['place', 'course', 'riding']) {
    assert.ok(read(`app/${kind}/[id].tsx`).includes('useLocalSearchParams'));
    const closed = await worker.default.fetch(new Request(`https://motomap.kr/${kind}/test-id`), env);
    assert.equal(closed.status, 503);
    assert.equal(closed.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(await closed.text(), /data-share-page/);
  }
  for (const path of ['/terms', '/privacy', '/location-terms']) {
    assert.equal((await worker.default.fetch(new Request(`https://motomap.kr${path}`), env)).status, 200);
  }
});

function browserFixture() {
  const documentEvents: Record<string, () => void> = {};
  const windowEvents: Record<string, () => void> = {};
  const timers = new Map<number, () => void>();
  const replacements: string[] = [];
  let click!: (event: { preventDefault: () => void }) => void;
  let timerId = 0;
  class Element {
    dataset = { appUrl: 'ridemap://place/test-id', storeUrl: 'https://apps.apple.com/kr/app/id6773636183' };
    querySelector(selector: string) {
      return selector === '[data-open-app]'
        ? { addEventListener: (_event: string, callback: typeof click) => { click = callback; } }
        : { textContent: '' };
    }
  }
  const document = {
    visibilityState: 'visible', querySelector: () => new Element(),
    addEventListener: (event: string, callback: () => void) => { documentEvents[event] = callback; },
  };
  const window = {
    location: { href: '', replace: (url: string) => { replacements.push(url); } },
    setTimeout: (callback: () => void, ms: number) => {
      assert.equal(ms, 1400); timers.set(++timerId, callback); return timerId;
    },
    clearTimeout: (id: number) => { timers.delete(id); },
    addEventListener: (event: string, callback: () => void) => { windowEvents[event] = callback; },
  };
  new Script(read('website/public/share.js')).runInNewContext({ document, window, HTMLElement: Element });
  return { document, window, documentEvents, windowEvents, timers, replacements,
    click: () => click({ preventDefault() {} }) };
}

test('공유 폴백은 앱을 먼저 시도하고 화면이 남은 경우만 스토어로 이동한다', () => {
  const browser = browserFixture();
  assert.equal(browser.window.location.href, 'ridemap://place/test-id');
  assert.equal(browser.replacements.length, 0);
  for (const timer of browser.timers.values()) timer();
  assert.deepEqual(browser.replacements, ['https://apps.apple.com/kr/app/id6773636183']);
});

test('앱 전환·페이지 이탈은 스토어 이동을 취소하고 수동 재시도는 타이머 하나만 둔다', () => {
  const browser = browserFixture();
  browser.document.visibilityState = 'hidden';
  browser.documentEvents.visibilitychange();
  assert.equal(browser.timers.size, 0);
  assert.equal(browser.replacements.length, 0);
  browser.document.visibilityState = 'visible';
  browser.click(); browser.click();
  assert.equal(browser.timers.size, 1);
  browser.windowEvents.pagehide();
  assert.equal(browser.timers.size, 0);
});

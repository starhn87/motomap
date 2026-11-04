import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function fixture() {
  let index = 0;
  const slots: any[] = [], cleanup: (() => void)[] = [];
  let reset: unknown;
  const module = loadModule<any>('hooks/usePullToRefresh.ts', { react: {
    useState: (initial: any) => { const i = index++; slots[i] ??= initial; return [slots[i], (next: any) => slots[i] = next]; },
    useRef: (initial: any) => { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect: (fn: any, deps: any[]) => { if (deps[0] !== reset || !cleanup.length) { cleanup.pop()?.(); reset = deps[0]; cleanup.push(fn()); } },
  } });
  return { render(refresh: any, key = 'actor:all') { index = 0; return module.usePullToRefresh(refresh, key); }, dispose() { cleanup.pop()?.(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('당김 동작만 새로고침 표시를 켜고 중복 당김은 한 요청으로 합친다', async () => {
  const app = fixture(); let complete!: () => void, calls = 0;
  const refresh = () => { calls++; return new Promise<void>(resolve => complete = resolve); };
  assert.equal(app.render(refresh).refreshing, false);
  app.render(refresh).onRefresh(); app.render(refresh).onRefresh();
  await tick();
  assert.equal(calls, 1); assert.equal(app.render(refresh).refreshing, true);
  complete(); await tick();
  assert.equal(app.render(refresh).refreshing, false);
  app.dispose();
});

test('계정·분류 전환 뒤 이전 요청 완료가 새 당김 표시를 끄지 않는다', async () => {
  const app = fixture(); let first!: () => void, second!: () => void;
  const refreshA = () => new Promise<void>(resolve => first = resolve);
  const refreshB = () => new Promise<void>(resolve => second = resolve);
  app.render(refreshA, 'a').onRefresh(); await tick();
  app.render(refreshB, 'b');
  assert.equal(app.render(refreshB, 'b').refreshing, false);
  app.render(refreshB, 'b').onRefresh(); await tick();
  first(); await tick(); assert.equal(app.render(refreshB, 'b').refreshing, true);
  second(); await tick(); assert.equal(app.render(refreshB, 'b').refreshing, false);
  app.dispose();
});

test('조회 실패도 표시를 종료해 다시 당길 수 있다', async () => {
  const app = fixture(); let calls = 0;
  const refresh = async () => { calls++; throw new Error('offline'); };
  app.render(refresh).onRefresh(); await tick();
  assert.equal(app.render(refresh).refreshing, false);
  app.render(refresh).onRefresh(); await tick(); assert.equal(calls, 2);
  app.dispose();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createForegroundWaiter } from '../lib/foregroundLink';

function fixture(state: string | null = 'inactive') {
  let listener: (state: string) => void = () => {};
  let removed = 0;
  const source = { currentState: state, addEventListener: (_event: 'change', callback: typeof listener) => {
    listener = callback;
    return { remove: () => { removed++; } };
  } };
  return { source, removed: () => removed,
    change: (state: string) => { source.currentState = state; listener(state); } };
}

test('이미 active이면 별도 리스너 없이 연결을 허용한다', async () => {
  const f = fixture('active');
  const waiter = createForegroundWaiter(f.source);
  assert.equal(await waiter.waitForActive(), true);
  assert.equal(f.removed(), 0);
  waiter.dispose();
});

test('inactive/background는 기다리고 active에서 리스너를 정리한다', async () => {
  const f = fixture();
  const waiter = createForegroundWaiter(f.source);
  let finished = false;
  const pending = waiter.waitForActive().then((active) => { finished = true; return active; });
  f.change('background');
  await Promise.resolve();
  assert.equal(finished, false);
  f.change('active');
  assert.equal(await pending, true);
  assert.equal(f.removed(), 1);
  waiter.dispose();
});

test('언마운트하면 대기를 취소하고 이후 active에서도 연결하지 않는다', async () => {
  const f = fixture(null);
  const waiter = createForegroundWaiter(f.source);
  const pending = waiter.waitForActive();
  waiter.dispose();
  assert.equal(await pending, false);
  f.change('active');
  assert.equal(f.removed(), 1);
  assert.equal(await waiter.waitForActive(), false);
});

test('새 탭으로 이전 대기를 취소해도 다음 foreground 대기는 정상 동작한다', async () => {
  const f = fixture();
  const waiter = createForegroundWaiter(f.source);
  const old = waiter.waitForActive();
  waiter.cancelPending();
  assert.equal(await old, false);
  const next = waiter.waitForActive();
  f.change('active');
  assert.equal(await next, true);
  assert.equal(f.removed(), 2);
  waiter.dispose();
});

test('리스너 등록과 동시에 active가 되어도 누락하거나 구독을 남기지 않는다', async () => {
  let removed = 0;
  const source = { currentState: 'inactive', addEventListener: (_event: 'change', listener: (state: string) => void) => {
    source.currentState = 'active';
    listener('active');
    return { remove: () => { removed++; } };
  } };
  const waiter = createForegroundWaiter(source);
  assert.equal(await waiter.waitForActive(), true);
  assert.equal(removed, 1);
  waiter.dispose();
});

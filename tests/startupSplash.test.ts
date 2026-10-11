import assert from 'node:assert/strict';
import test from 'node:test';

import { loadModule } from './helpers/loadModule';

function setup(elapsed: number) {
  let delay: number | undefined;
  let callback: (() => void) | undefined;
  let cleared = false;
  let hidden = 0;
  const splash = loadModule<{
    STARTUP_SPLASH_MIN_MS: number;
    STARTUP_SPLASH_FADE_MS: number;
    scheduleStartupSplashHide: (startedAt: number, hide: () => void) => () => void;
  }>('lib/startupSplash.ts', {}, {
    performance: { now: () => 1000 + elapsed },
    setTimeout: (fn: () => void, ms: number) => { callback = fn; delay = ms; return 1; },
    clearTimeout: (id: number) => { assert.equal(id, 1); cleared = true; },
  });
  return {
    splash,
    schedule: () => splash.scheduleStartupSplashHide(1000, () => { hidden += 1; }),
    delay: () => delay,
    hidden: () => hidden,
    fire: () => { if (!cleared) callback?.(); },
  };
}

test('시작 화면은 최소 500ms 유지하고 페이드는 180ms로 짧게 설정한다', () => {
  const { splash } = setup(0);
  assert.equal(splash.STARTUP_SPLASH_MIN_MS, 500);
  assert.equal(splash.STARTUP_SPLASH_FADE_MS, 180);
});

test('빠른 화면 준비는 남은 최소 노출 시간만 기다린 뒤 숨긴다', () => {
  const timer = setup(120);
  timer.schedule();
  assert.equal(timer.delay(), 380);
  assert.equal(timer.hidden(), 0);
  timer.fire();
  assert.equal(timer.hidden(), 1);
});

test('준비에 500ms 이상 걸렸다면 별도 500ms 대기를 추가하지 않는다', () => {
  const timer = setup(850);
  timer.schedule();
  assert.equal(timer.delay(), 0);
  timer.fire();
  assert.equal(timer.hidden(), 1);
});

test('언마운트·준비 상태 변경 시 예약한 숨김을 취소한다', () => {
  const timer = setup(100);
  const cancel = timer.schedule();
  cancel();
  timer.fire();
  assert.equal(timer.hidden(), 0);
});

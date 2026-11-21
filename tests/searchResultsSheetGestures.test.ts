import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';

const { code } = transformSync(
  readFileSync(new URL('../lib/searchResultsSheetGestures.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'cjs' },
);

const CONTENT = 3;
const HANDLE = 2;
const GESTURE = 2;

type Pan = { translationX: number; translationY: number; velocityY: number };
const upward: Pan = { translationX: 5, translationY: -95, velocityY: -315 };

function fixture(index = 1, temporary = false) {
  const defaultCalls: string[] = [];
  const animations: number[][] = [];
  const animatedIndex = { value: index };
  const dependencies: Record<string, unknown> = {
    react: { useCallback: (fn: unknown) => fn },
    'react-native-reanimated': { useSharedValue: (value: boolean) => ({ value }) },
    '@gorhom/bottom-sheet': {
      ANIMATION_SOURCE: { GESTURE },
      GESTURE_SOURCE: { CONTENT, HANDLE },
      useBottomSheetInternal: () => ({
        animatedIndex,
        animatedDetentsState: { get: () => ({ highestDetentPosition: 138 }) },
        isInTemporaryPosition: { value: temporary },
        animateToPosition: (...args: number[]) => animations.push(args),
      }),
      useGestureEventsHandlersDefault: () => ({
        handleOnStart: () => defaultCalls.push('start'),
        handleOnEnd: () => defaultCalls.push('end'),
      }),
    },
  };
  type Handler = (source: number, payload: Pan) => void;
  const tested = { exports: {} as {
    useIOSSearchResultsSheetGestures: () => { handleOnStart: Handler; handleOnEnd: Handler };
  } };
  new Script(code).runInNewContext({
    module: tested, exports: tested.exports,
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });

  function drag(source: number, pan: Pan, draggedIndex = index) {
    const { handleOnStart, handleOnEnd } = tested.exports.useIOSSearchResultsSheetGestures();
    handleOnStart(source, pan);
    animatedIndex.value = draggedIndex;
    handleOnEnd(source, pan);
  }
  return { drag, animations, defaultCalls };
}

test('iOS 중간 시트 본문을 짧게 위로 밀면 최대 스냅으로 확장한다', () => {
  const { drag, animations, defaultCalls } = fixture();
  drag(CONTENT, upward, 1.25);
  assert.deepEqual(animations, [[138, GESTURE, -157.5]]);
  assert.deepEqual(defaultCalls, ['start']);
});

test('손잡이·다른 스냅·짧은 움직임·가로·아래 드래그에는 기본 동작을 쓴다', () => {
  for (const [index, temporary, source, pan] of [
    [1, false, HANDLE, upward],
    [0, false, CONTENT, upward],
    [2, false, CONTENT, upward],
    [1, true, CONTENT, upward],
    [1, false, CONTENT, { ...upward, translationY: -30 }],
    [1, false, CONTENT, { ...upward, translationX: 100 }],
    [1, false, CONTENT, { ...upward, translationY: 90 }],
    [1, false, CONTENT, { ...upward, velocityY: 120 }],
  ] as const) {
    const { drag, animations, defaultCalls } = fixture(index, temporary);
    drag(source, pan);
    assert.deepEqual(animations, []);
    assert.deepEqual(defaultCalls, ['start', 'end']);
  }
});

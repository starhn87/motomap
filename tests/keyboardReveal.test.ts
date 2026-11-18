import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function mountReveal() {
  const listeners = new Map<string, (event?: any) => void>();
  const frames = new Map<number, () => void>();
  let sequence = 0;
  let inset = 0;
  let offset = 398;
  let viewportMeasurement: ((...values: number[]) => void) | undefined;
  const input = { measureInWindow: (done: (...values: number[]) => void) => done(20, 432 - (offset - 398), 320, 70) };
  const scroll = {
    getNativeScrollRef: () => ({ measureInWindow: (done: (...values: number[]) => void) => { viewportMeasurement = done; } }),
    getInnerViewRef: () => ({ measureInWindow: (done: (...values: number[]) => void) => done(0, 28 - offset) }),
    scrollTo: ({ y }: { y: number }) => { offset = Math.min(y, 398 + inset); },
  };
  const { useRevealKeyboardInput } = loadModule<any>('hooks/useRevealKeyboardInput.ts', {
    react: {
      useCallback: (fn: unknown) => fn,
      useEffect: (fn: () => unknown) => fn(),
      useRef: (current: unknown) => ({ current }),
      useState: () => [0, (value: number) => { inset = value; }],
    },
    'react-native': {
      Platform: { OS: 'android' },
      Dimensions: { get: () => ({ height: 780 }) },
      TextInput: { State: { currentlyFocusedInput: () => input } },
      Keyboard: {
        metrics: () => undefined,
        addListener: (name: string, callback: (event?: any) => void) => {
          listeners.set(name, callback);
          return { remove() {} };
        },
      },
    },
  }, {
    requestAnimationFrame: (fn: () => void) => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const hook = useRevealKeyboardInput({ current: { getScrollResponder: () => scroll } }, { padOccludedContent: true });
  const flush = () => { for (const [id, fn] of frames) { frames.delete(id); fn(); } };
  hook.onFocus();
  listeners.get('keyboardDidShow')!({ endCoordinates: { screenY: 438, height: 294 } });
  flush();
  return {
    hide: () => listeners.get('keyboardDidHide')!(),
    measure: () => viewportMeasurement!(0, 28, 360, 752),
    inset: () => inset,
    inputBottom: () => 502 - (offset - 398),
  };
}

test('Android: 크기가 줄지 않는 시트도 키보드 위로 입력란을 스크롤할 수 있다', () => {
  const view = mountReveal();
  assert.ok(view.inputBottom() > 438);
  view.measure();
  assert.equal(view.inset(), 342);
  assert.ok(view.inputBottom() <= 426);
  view.hide();
  assert.equal(view.inset(), 0);
});

test('Android: 키보드가 닫힌 뒤 도착한 측정값은 하단 여유를 되살리지 않는다', () => {
  const view = mountReveal();
  view.hide();
  view.measure();
  assert.equal(view.inset(), 0);
});

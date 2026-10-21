import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import type { useVoiceSearch } from '../hooks/useVoiceSearch';

function setup() {
  let permission!: (value: { granted: boolean }) => void;
  let starts = 0, aborts = 0;
  const refs: { current: unknown }[] = [];
  const cleanups: (() => void)[] = [];
  const handlers: Record<string, (...args: any[]) => void> = {};
  const received: string[] = [];
  const module = loadModule<{ useVoiceSearch: typeof useVoiceSearch }>('hooks/useVoiceSearch.ts', {
    react: {
      useState: () => [false, () => {}],
      useRef: (current: unknown) => { const ref = { current }; refs.push(ref); return ref; },
      useEffect: (run: () => () => void) => cleanups.push(run()),
    },
    'react-native': { Keyboard: { dismiss() {} } },
    'expo-speech-recognition': {
      useSpeechRecognitionEvent: (name: string, callback: (...args: any[]) => void) => { handlers[name] = callback; },
      ExpoSpeechRecognitionModule: {
        requestPermissionsAsync: () => new Promise((resolve) => { permission = resolve; }),
        start: () => { starts++; }, abort: () => { aborts++; }, stop() {},
      },
    },
    '@/lib/toast': { toast: { error() {} } },
  });
  const hook = module.useVoiceSearch((text) => received.push(text));
  return {
    hook, received,
    grant: () => permission({ granted: true }),
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
    result: () => handlers.result({ results: [{ transcript: '이전 필드 검색' }], isFinal: true }),
    counts: () => ({ starts, aborts }),
  };
}

test('검색 필드를 닫거나 unmount한 뒤 권한이 도착해도 녹음을 시작하지 않는다', async () => {
  for (const unmount of [false, true]) {
    const f = setup();
    const pending = f.hook.toggle();
    if (unmount) f.unmount(); else f.hook.stop();
    f.grant();
    await pending;
    assert.equal(f.counts().starts, 0);
    assert.equal(f.received.length, 0);
  }
});

test('모달이 음성 검색을 중지하면 이전 세션 결과를 다른 필드로 전달하지 않는다', async () => {
  const f = setup();
  const pending = f.hook.toggle();
  f.grant(); await pending;
  assert.equal(f.counts().starts, 1);
  f.hook.stop(); f.result();
  assert.equal(f.counts().aborts, 1);
  assert.deepEqual(f.received, ['']);
});

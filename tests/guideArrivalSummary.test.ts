import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// 네이티브 Surface 입력으로 실제 패널 JSX를 실행하고 화면에 남는 글자를 확인한다.
function renderPanel(platform: 'IOS', state: Record<string, unknown>, showGoal = false) {
  let hook = 0;
  const element = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const module = { exports: {} as { default?: (props: unknown) => unknown } };
  const code = ts.transpileModule(readFileSync(new URL(`../components/navigation/${platform}GuidePanel.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { module, exports: module.exports, require: (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' };
    if (name === 'react') return {
      useEffect() {}, useRef: (value: unknown) => ({ current: value }),
      useMemo: (create: () => unknown) => create(), useCallback: (callback: unknown) => callback,
      useState: (initial: unknown) => {
        const index = hook++;
        const value = index === 0 ? { state, expanded: false, bottomInset: 0 } : index === 2 ? showGoal
          : typeof initial === 'function' ? initial() : initial;
        return [value, () => {}];
      },
    };
    if (name === 'react-native') return {
      View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView',
      StyleSheet: { create: (value: unknown) => value }, useColorScheme: () => 'light',
      PanResponder: { create: () => ({ panHandlers: {} }) },
    };
    if (name === 'expo-modules-core') return { requireOptionalNativeModule: () => null };
    if (name.startsWith('@expo/vector-icons/')) return () => null;
    if (name === 'react-native-reanimated') return {
      __esModule: true, default: { View: 'View' },
      useSharedValue: (value: unknown) => ({ value }), useAnimatedStyle: (create: () => unknown) => create(),
    };
    if (name === '@/lib/typography') return { APP_FONT_FAMILY: 'Pretendard' };
    if (name.endsWith('.png')) return 0;
    throw new Error(`Unexpected panel import: ${name}`);
  } });
  function text(node: any): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    if (typeof node.type === 'function') return text(node.type(node.props));
    return text(node.props.children);
  }
  return text(module.exports.default!({ token: 'arrival-test', menu: false }));
}

const summary = { goalName: '도착 카페', currentLocationName: '테헤란로', remainingTime: 45, remainingDistance: 120 };

for (const platform of ['IOS'] as const) {
test(`${platform}: 도착 대기와 복귀 경로 요청 중에도 시간·거리·목적지를 유지한다`, () => {
  for (const status of ['', '복귀 경로를 찾고 있어요']) {
    for (const showGoal of [false, true]) {
      const text = renderPanel(platform, { ...summary, status, busy: !!status }, showGoal);
      assert.match(text, /1분/);
      assert.match(text, /120m/);
      assert.match(text, /도착 카페/);
      assert.doesNotMatch(text, /테헤란로|복귀 경로를 찾고 있어요/);
    }
  }
});

test(`${platform}: 새 안내에서는 새 숫자를 표시하고 위치·목적지 교대를 복원한다`, () => {
  const state = { ...summary, goalName: '새 도착지', remainingTime: 180, remainingDistance: 900 };
  assert.match(renderPanel(platform, state), /테헤란로3분900m/);
  assert.match(renderPanel(platform, state, true), /새 도착지3분900m/);
});

test(`${platform}: 확인된 경로 요약이 없으면 남은 거리와 시간을 만들지 않는다`, () => {
  const text = renderPanel(platform, { goalName: '도착 카페', status: '복귀 경로를 찾고 있어요' });
  assert.match(text, /도착 카페복귀 경로를 찾고 있어요/);
  assert.doesNotMatch(text, /0분|0m/);
});
}

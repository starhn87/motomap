import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

type Element = { type: any; props: any };
const jsx = (type: any, props: any) => ({ type, props });
const flatten = (value: any): any => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value ?? {};
const nodes = (node: any): Element[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];

function fixture({ os = 'ios', native = null as any, reduced = false, scheme = 'light' } = {}) {
  let state = true, started = false, pendingEffect: (() => any) | undefined, cleanup: (() => void) | undefined;
  let listener: ((value: boolean) => void) | undefined, removed = 0, nativeLoads = 0, availabilityChecks = 0;
  let resolveSetting: (value: boolean) => void = () => {};
  const setting = new Promise<boolean>(resolve => { resolveSetting = resolve; });
  const module = loadModule<{ default: (props: any) => Element }>('components/ui/GlassSurface.tsx', {
    expo: { requireOptionalNativeModule: () => { availabilityChecks++; return native; } },
    react: { useState: () => [state, (value: boolean) => { state = value; }], useEffect: (fn: () => any) => { if (!started) pendingEffect = fn; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: os }, View: 'View', StyleSheet: { create: (style: any) => style, flatten, hairlineWidth: 0.5, absoluteFill: { position: 'absolute' } },
      AccessibilityInfo: { isReduceTransparencyEnabled: () => setting, addEventListener: (_name: string, fn: (value: boolean) => void) => {
        listener = fn; return { remove: () => removed++ };
      } } },
    'expo-glass-effect': { get GlassView() { nativeLoads++; return 'NativeGlass'; } },
    '@/constants/Colors': { __esModule: true, default: { light: { surfaceElevated: 'white', border: 'gray' }, dark: { surfaceElevated: 'dark', border: 'dark-border' } } },
    '@/components/useColorScheme': { useColorScheme: () => scheme },
  });
  const render = () => {
    const tree = module.default({ style: { width: 44, height: 44, borderRadius: 22 }, children: jsx('Button', { accessibilityLabel: '설정' }) });
    if (!started) { started = true; cleanup = pendingEffect?.(); }
    return tree;
  };
  return { render, resolve: () => resolveSetting(reduced), setting: resolveSetting,
    change: (value: boolean) => listener?.(value), dispose: () => cleanup?.(),
    counts: () => ({ nativeLoads, availabilityChecks, removed }) };
}

test('모듈 없는 구빌드·미지원 OS/API에서는 native view 모듈을 평가하지 않는다', () => {
  for (const config of [{}, { os: 'android' }, { os: 'web' },
    { native: { isLiquidGlassAvailable: true, isGlassEffectAPIAvailable: false } },
    { native: { isLiquidGlassAvailable: false, isGlassEffectAPIAvailable: true } }]) {
    const app = fixture(config);
    const tree = app.render();
    assert.equal(app.counts().nativeLoads, 0);
    assert.equal(nodes(tree).some(node => node.type === 'NativeGlass'), false);
    assert.equal(flatten(tree.props.style).backgroundColor, 'white');
    assert.equal(nodes(tree).find(node => node.type === 'Button')?.props.accessibilityLabel, '설정');
    assert.equal(flatten(tree.props.style).width, 44);
    if (config.os) assert.equal(app.counts().availabilityChecks, 0);
  }
});

test('실제 API가 있어도 투명도 설정 확인 전에는 단색이며 해제 후 native Glass를 쓴다', async () => {
  const app = fixture({ native: { isLiquidGlassAvailable: true, isGlassEffectAPIAvailable: true }, scheme: 'dark' });
  assert.equal(nodes(app.render()).some(node => node.type === 'NativeGlass'), false);
  app.resolve(); await Promise.resolve();
  let tree = app.render();
  const glass = nodes(tree).find(node => node.type === 'NativeGlass')!;
  assert.ok(glass); assert.equal(glass.props.colorScheme, 'dark');
  assert.equal(glass.props.pointerEvents, 'none');
  assert.equal(flatten(tree.props.style).backgroundColor, 'transparent');
  app.change(true); tree = app.render();
  assert.equal(nodes(tree).some(node => node.type === 'NativeGlass'), false);
  assert.equal(flatten(tree.props.style).backgroundColor, 'dark');
  app.change(false); assert.equal(nodes(app.render()).some(node => node.type === 'NativeGlass'), true);
  app.dispose(); assert.equal(app.counts().removed, 1);
});

test('늦은 접근성 조회 결과가 더 최신 설정 이벤트를 덮어쓰지 않는다', async () => {
  const app = fixture({ native: { isLiquidGlassAvailable: true, isGlassEffectAPIAvailable: true } });
  app.render(); app.change(true); app.setting(false);
  await Promise.resolve();
  const tree = app.render();
  assert.equal(nodes(tree).some(node => node.type === 'NativeGlass'), false);
  assert.equal(flatten(tree.props.style).backgroundColor, 'white');
});

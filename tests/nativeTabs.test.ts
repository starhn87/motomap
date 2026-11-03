import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { loadModule } from './helpers/loadModule';

type Element = { type: any; props: any };
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });
const colors = { text: 'black', textSecondary: 'gray', tint: 'black', tabIconSelected: '#007AFF', background: 'white', surfaceElevated: 'elevated', border: 'gray' };
const nodes = (node: any): Element[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];

function layout(os: string, unread: number, scheme = 'light', version = 27) {
  const trigger = Object.assign(() => null, { Icon: 'NativeIcon', Label: 'NativeLabel', Badge: 'NativeBadge' });
  const NativeTabs = Object.assign(() => null, { Trigger: trigger });
  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const module = loadModule<{ default: () => Element }>('app/(tabs)/_layout.tsx', {
    react: exported({}), 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: os, Version: version }, Pressable: 'Button', StyleSheet: { hairlineWidth: 0.5 } },
    '@expo/vector-icons/Ionicons': exported('Icon'),
    'expo-router': { Tabs: Object.assign(() => null, { Screen: 'LegacyScreen' }) },
    'expo-router/unstable-native-tabs': { NativeTabs },
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets },
    'react-native-reanimated': { ...exported({ View: 'AnimatedView' }), useSharedValue: () => ({ value: 1 }) },
    '@/constants/Colors': { ...exported({ light: colors, dark: { ...colors, tint: '#FAFAFA', tabIconSelected: '#FAFAFA' } }), semantic: { danger: 'red' } },
    '@/components/useColorScheme': { useColorScheme: () => scheme },
    '@/hooks/useNotifications': { useUnreadCount: () => unread },
    '@/components/navigation/SettingsButton': exported('Settings'),
    '@/components/navigation/NativeTabScreen': { NativeTabDeviceInsetsContext: { Provider: 'DeviceInsets' } },
    '@/components/navigation/tabOcclusion': {
      TabOcclusionContext: { Provider: 'TabOcclusion' },
      FLOATING_TAB_BAR_HEIGHT: 56,
      FLOATING_TAB_LIFT: 10,
      useJsTabOcclusion: () => insets.bottom + 10 + 56,
    },
  });
  const entry = module.default();
  return { tree: entry.type(entry.props), NativeTabs, trigger, insets };
}

test('iOS는 UIKit 탭 4개·시스템 아이콘·미읽음 배지를 쓰고 탭 높이나 가짜 블러를 지정하지 않는다', () => {
  const { tree, NativeTabs, trigger, insets } = layout('ios', 12);
  assert.equal(tree.type, 'DeviceInsets');
  assert.equal(tree.props.value, insets);
  const native = nodes(tree).find(node => node.type === NativeTabs)!;
  assert.equal(native.props.minimizeBehavior, 'never');
  assert.equal(native.props.sidebarAdaptable, false);
  assert.equal(native.props.style, undefined);
  assert.equal(native.props.backgroundColor, undefined);
  assert.equal(native.props.blurEffect, undefined);
  assert.equal(native.props.disableTransparentOnScrollEdge, undefined);
  assert.equal(native.props.unstable_nativeProps.tabBarHidden, undefined, '지도 시트 때문에 바를 숨기거나 레이아웃을 바꾸지 않는다');
  const tabs = nodes(tree).filter(node => node.type === trigger);
  assert.deepEqual(tabs.map(tab => tab.props.name), ['index', 'submit', 'courses', 'profile']);
  assert.ok(tabs.every(tab => tab.props.disableAutomaticContentInsets));
  assert.equal(tabs[0].props.disablePopToTop, true);
  assert.equal(tabs[0].props.disableScrollToTop, true);
  assert.deepEqual(nodes(tree).filter(node => node.type === 'NativeLabel').map(node => node.props.children), ['지도', '제보', '활동', '내 정보']);
  assert.equal(nodes(tabs[2]).some(node => node.type === 'NativeBadge'), true);
  assert.equal(nodes(tabs[3]).some(node => node.type === 'NativeBadge'), false);
  assert.equal(nodes(tree).find(node => node.type === 'NativeBadge')?.props.children, undefined);
  assert.ok(nodes(tree).filter(node => node.type === 'NativeIcon').every(node => node.props.sf.default && node.props.sf.selected));
  assert.equal(nodes(layout('ios', 0).tree).some(node => node.type === 'NativeBadge'), false);
});

test('Android·웹은 기존 JS 탭과 4개 경로를 유지하고 탭은 화면 높이를 차지하지 않는다', () => {
  for (const os of ['android', 'web']) {
    const { tree } = layout(os, 0);
    assert.equal(tree.type, 'TabOcclusion');
    const tabs = tree.props.children;
    assert.deepEqual(nodes(tabs).filter(node => node.type === 'LegacyScreen').map(node => node.props.name), ['index', 'submit', 'courses', 'profile']);
    assert.equal(tabs.props.screenOptions.tabBarStyle.position, 'absolute');
    assert.equal(tabs.props.screenOptions.tabBarActiveTintColor, '#007AFF');
    assert.equal(tabs.props.screenOptions.tabBarStyle.height, 56);
    assert.equal(tabs.props.screenOptions.tabBarStyle.bottom, 44);
    assert.equal(tabs.props.screenOptions.headerTitleStyle.fontWeight, '700');
    assert.equal(tabs.props.screenOptions.headerStyle.backgroundColor, colors.background);
  }
});

test('iOS 탭은 host 테마를 상속하고 trigger에 이전 테마를 복사해 고정하지 않는다', () => {
  for (const scheme of ['light', 'dark']) {
    const { tree, NativeTabs, trigger } = layout('ios', 0, scheme);
    const native = nodes(tree).find(node => node.type === NativeTabs)!;
    assert.equal(native.props.unstable_nativeProps.colorScheme, scheme);
    const selected = scheme === 'light' ? 'black' : '#FAFAFA';
    assert.equal(native.props.tintColor, selected);
    assert.equal(native.props.iconColor.selected, selected);
    const tabs = nodes(tree).filter(node => node.type === trigger);
    assert.ok(tabs.every(tab => tab.props.unstable_nativeProps?.ios?.experimental_userInterfaceStyle === undefined));
  }
});

test('Glass 이전 iOS도 라이트 외형에 다크 배경·흰 선택색을 강제하지 않는다', () => {
  const { tree, NativeTabs } = layout('ios', 0, 'light', 18);
  const native = nodes(tree).find(node => node.type === NativeTabs)!;
  assert.equal(native.props.unstable_nativeProps.colorScheme, 'light');
  assert.equal(native.props.backgroundColor, undefined);
  assert.equal(native.props.blurEffect, undefined);
  assert.equal(native.props.disableTransparentOnScrollEdge, undefined);
  assert.equal(native.props.iconColor.selected, 'black');
});


function frameFixture(os = 'ios') {
  let focused = false;
  let cursor = 0;
  const states: unknown[] = [];
  let effects: (() => void)[] = [];
  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const Screen = () => null;
  const module = loadModule<any>('components/navigation/NativeTabScreen.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { createContext: () => ({ Provider: 'DeviceInsets' }), useContext: () => insets,
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(states[index]) : value; }];
      },
      useEffect: (fn: () => void) => effects.push(fn) },
    'expo-router': { useIsFocused: () => focused },
    'react-native': { Platform: { OS: os }, Text: 'Text', View: 'View', StyleSheet: { create: (style: any) => style, hairlineWidth: 0.5 } },
    'react-native-screens/experimental': { SafeAreaView: 'NativeSafeArea' },
    'react-native-safe-area-context': { SafeAreaInsetsContext: { Provider: 'DeviceEdges' }, useSafeAreaInsets: () => insets },
    './headerScroll': { HeaderScrollProvider: 'ScrollProvider' },
    './headerInset': { HeaderInsetContext: { Provider: 'HeaderInset' } },
    '@/components/ui/HeaderBackdrop': exported('Backdrop'),
    './tabOcclusion': { TabOcclusionContext: { Provider: 'TabOcclusion' } },
    '@/constants/Colors': exported({ light: colors }), '@/components/useColorScheme': { useColorScheme: () => 'light' }, './SettingsButton': exported('Settings'),
  });
  const wrap = (options: any) => module.withNativeTabScreen(Screen, options);
  const render = (wrapped: () => Element) => {
    cursor = 0;
    const entry = wrapped();
    if (entry.type === Screen) return entry;
    const tree = entry.type(entry.props);
    effects.forEach(fn => fn()); effects = [];
    return tree;
  };
  return { Screen, wrap, render, insets, focus(value: boolean) { focused = value; } };
}

test('상단 안전영역은 헤더에 한 번만 포함하고 콘텐츠는 같은 총높이를 피한다', () => {
  const app = frameFixture(); app.focus(true);
  const screen = app.wrap({ title: '내 정보' });
  let tree = app.render(screen);
  assert.equal(nodes(tree).find(node => node.type === 'NativeSafeArea')?.props.edges.top, false);
  assert.equal(nodes(tree).find(node => node.type === 'HeaderInset')?.props.value, app.insets.top + 44);
  const header = nodes(tree).find(node => node.type === 'View' && Array.isArray(node.props.style) && node.props.style[0]?.zIndex === 10)!;
  header.props.onLayout({ nativeEvent: { layout: { height: app.insets.top + 44 } } });
  tree = app.render(screen);
  assert.equal(nodes(tree).find(node => node.type === 'HeaderInset')?.props.value, app.insets.top + 44);
});

test('iOS 화면은 첫 포커스 전까지 본체를 미루고 이후에는 탭 이탈에도 같은 본체를 보존한다', () => {
  const app = frameFixture();
  const wrapped = app.wrap({ title: '내 정보', settings: true });
  assert.equal(nodes(app.render(wrapped)).some(node => node.type === app.Screen), false);
  app.focus(true);
  let tree = app.render(wrapped);
  assert.equal(nodes(tree).some(node => node.type === app.Screen), true);
  app.focus(false);
  tree = app.render(wrapped);
  assert.equal(nodes(tree).find(node => node.type === app.Screen)?.type, app.Screen);
  assert.equal(nodes(tree).find(node => node.type === 'Text')?.props.children, '내 정보');
  assert.equal(nodes(tree).some(node => node.type === 'Settings'), true);
  const header = nodes(tree).find(node => node.type === 'View' && Array.isArray(node.props.style) && node.props.style[0]?.zIndex === 10);
  assert.equal(header?.props.style[0].borderBottomWidth, undefined);
  assert.equal(nodes(header).some(node => node.type === 'Backdrop'), true);
  assert.equal(nodes(tree).find(node => node.type === 'HeaderInset')?.props.value, app.insets.top + 44);
  assert.equal(tree.props.value, app.insets, '전체화면 모달에는 탭 높이가 섞이지 않은 기기 inset을 전달');
  assert.deepEqual({ ...nodes(tree).find(node => node.type === 'NativeSafeArea')?.props.edges }, { top: false, bottom: false, left: true, right: true });
});

test('지도에는 새 상단 헤더가 없고 Android에는 native safe-area·중복 헤더를 추가하지 않는다', () => {
  const app = frameFixture();
  app.focus(true);
  const tree = app.render(app.wrap({}));
  assert.equal(nodes(tree).some(node => node.type === 'Text'), false);
  assert.equal(nodes(tree).find(node => node.type === 'NativeSafeArea')?.props.edges.top, false);
  const android = frameFixture('android');
  assert.equal(android.render(android.wrap({ title: '탐색' })).type, android.Screen);
});

test('설정은 로그인과 무관하게 텍스트 없는 44pt Glass 아이콘으로 연다', () => {
  let pushed = '';
  const module = loadModule<any>('components/navigation/SettingsButton.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@expo/vector-icons/Ionicons': exported('Icon'), 'expo-router': { router: { push: (url: string) => { pushed = url; } } },
    'react-native': { Pressable: 'Button', Text: 'Text', View: 'View', StyleSheet: { create: (style: any) => style } },
    '@/constants/Colors': { ...exported({ light: colors }), semantic: { danger: 'red' } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/components/ui/GlassButton': exported('Glass'),
  });
  const tree = module.default();
  assert.equal(tree.props.accessibilityLabel, '설정');
  assert.equal(nodes(tree).some(node => node.type === 'Text'), false);
  const glass = nodes(tree).find(node => node.type === 'Glass')!;
  assert.equal(glass.props.style.width, 44); assert.equal(glass.props.style.height, 44);
  tree.props.onPress(); assert.equal(pushed, '/settings');
});

test('지도 레이아웃이 달라지면 FAB와 장소 카메라 보정에 같은 실제 높이를 사용한다', () => {
  const path = 'components/map/MapHome.tsx';
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let offset: ts.FunctionDeclaration | undefined, onLayout: ts.Expression | undefined, select: ts.Expression | undefined, temp: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'sheetLatOffset') offset = node;
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onLayout' && node.initializer && ts.isJsxExpression(node.initializer)) onLayout = node.initializer.expression;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSearchPointSelect' && node.initializer && ts.isCallExpression(node.initializer)) select = node.initializer.arguments[0];
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleTempPlaceSelect' && node.initializer && ts.isCallExpression(node.initializer)) temp = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(offset && onLayout && select && temp);
  const { outputText } = ts.transpileModule(`${offset.getText(ast)}\nmodule.exports = { layout: ${onLayout.getText(ast)}, select: ${select.getText(ast)}, temp: ${temp.getText(ast)} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const shared = { value: 0 }, context: any = { mapViewportHeight: 900, containerHeight: shared,
    setMapViewportHeight: (height: number) => { context.mapViewportHeight = height; }, followingRef: { current: true }, mapRef: { current: { animateCameraTo: (camera: any) => { context.camera = camera; } } },
    mapCenter: { zoom: 15 }, setSelectedPlaceId() {}, setSelectedPlace() {}, setSelectedStation() {}, setHighlightReview() {}, setTempPlace() {},
    module: { exports: {} } };
  new Script(outputText).runInNewContext(context);
  const api = context.module.exports;
  for (const handler of [api.select, api.temp]) {
    api.layout({ nativeEvent: { layout: { height: 700 } } });
    assert.equal(shared.value, 700); assert.equal(context.mapViewportHeight, 700);
    handler({ latitude: 37.5, longitude: 127 });
    const first = context.camera.latitude;
    api.layout({ nativeEvent: { layout: { height: 400 } } });
    handler({ latitude: 37.5, longitude: 127 });
    assert.ok(context.camera.latitude > first, '가용 지도 높이가 줄면 수직 보정도 줄어야 함');
    assert.equal(context.camera.longitude, 127);
    assert.equal(context.followingRef.current, false);
  }
});

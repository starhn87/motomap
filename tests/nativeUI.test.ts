import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });
const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props
  ? [node, ...nodes(node.props.children)] : [];
const views = Object.fromEntries(['Host', 'Menu', 'Picker', 'Text', 'VStack', 'HStack', 'Image', 'Spacer', 'Button', 'Divider', 'ProgressView']
  .map(name => [name, name]));
const modifiers: Record<string, any> = Object.fromEntries(['accessibilityLabel', 'accessibilityValue', 'disabled', 'frame', 'labelsHidden', 'pickerStyle', 'tag', 'contentShape',
  'accessibilityIdentifier', 'accessibilityElement', 'accessibilityHidden', 'buttonStyle', 'controlSize', 'font', 'foregroundStyle', 'padding'].map(name => [name, (value: any) => ({ name, value })]));
modifiers.shapes = { rectangle: () => ({ shape: 'rectangle' }) };
const colors = { text: 'black', textSecondary: 'gray', surface: 'white' };
const deps = {
  '@/lib/typography': { APP_FONT_FAMILY: 'Pretendard' },
  react: { Fragment: 'Fragment' }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', useWindowDimensions: () => ({ fontScale: 1 }) },
  '@/lib/nativeUI': { nativeUI: { views, modifiers } }, '@/constants/Colors': { ...exported({ light: colors, dark: colors }), semantic: { danger: 'red', success: 'green' } },
  '@/components/useColorScheme': { useColorScheme: () => 'light' },
};

test('미지원 플랫폼·옛 계약·모듈 누락 설치본은 Expo UI JS를 평가하지 않는다', () => {
  for (const [os, version, features, installed] of [
    ['android', 40, ['native_ui_controls'], true], ['ios', 39, ['native_ui_controls'], true],
    ['ios', 40, [], true], ['ios', 40, ['native_ui_controls'], false],
  ] as const) {
    const module = loadModule<any>('lib/nativeUI.ts', {
      'react-native': { Platform: { OS: os } },
      expo: { requireOptionalNativeModule: (name: string) => name === 'KakaoNavi'
        ? { bridgeVersion: version, features } : installed ? {} : null },
      // guarded require가 잘못 실행되면 loadModule이 누락 의존성 오류로 실패한다.
    });
    assert.equal(module.nativeUI, null);
  }
  const supported = loadModule<any>('lib/nativeUI.ts', {
    'react-native': { Platform: { OS: 'ios' } }, expo: { requireOptionalNativeModule: (name: string) => name === 'KakaoNavi'
      ? { bridgeVersion: 40, features: ['native_ui_controls'] } : {} },
    '@expo/ui/swift-ui': views, '@expo/ui/swift-ui/modifiers': modifiers,
  });
  assert.equal(supported.nativeUI.views, views);
});

test('네이티브 선택은 유효한 변경만 전달하고 비활성·초기 동일 값은 무시한다', () => {
  let changes = 0;
  const module = loadModule<any>('components/ui/NativeChoiceControl.tsx', deps);
  const props = { value: 'all', options: [{ value: 'all', label: '전체' }, { value: 'places', label: '장소' }],
    label: '제보 종류', presentation: 'menu', onChange: () => changes++ };
  const tree = module.default(props);
  assert.equal(tree.props.colorScheme, 'light');
  assert.equal(tree.props.ignoreSafeArea, 'container', '화면 safe area는 부모 RN 레이아웃이 관리한다');
  const menu = nodes(tree).find(node => node.type === 'Menu');
  const picker = nodes(tree).find(node => node.type === 'Picker');
  assert.equal(tree.props.style.width, 72); assert.equal(tree.props.style.height, 32);
  assert.equal(picker.props.label, '제보 종류');
  assert.equal(picker.props.modifiers.some((modifier: any) => modifier.name === 'accessibilityLabel'), false,
    'Picker 자체 label을 다시 덮어 VoiceOver 이름을 중복하지 않는다');
  assert.ok(menu.props.modifiers.some((modifier: any) => modifier.name === 'accessibilityIdentifier' && modifier.value === 'native-choice-제보 종류'));
  picker.props.onSelectionChange('all'); picker.props.onSelectionChange(null); picker.props.onSelectionChange('unknown');
  assert.equal(changes, 0);
  picker.props.onSelectionChange('places'); assert.equal(changes, 1);
  nodes(module.default({ ...props, enabled: false })).find(node => node.type === 'Picker').props.onSelectionChange('places');
  assert.equal(changes, 1);
  assert.deepEqual(module.default({ ...props, presentation: 'segmented' }).props.style.width, '100%');
});

test('설정 네이티브 행은 표시 전용·중복 잠금·파괴적 확인 진입을 구분한다', () => {
  const calls: string[] = [];
  const module = loadModule<any>('components/ui/NativeSettingsGroup.tsx', deps);
  const tree = module.default({ rows: [
    { key: 'version', label: '버전', value: '1.2.11' },
    { key: 'kakao', label: '카카오', disabled: true, onPress: () => calls.push('link') },
    { key: 'naver', label: '네이버', loading: true, onPress: () => calls.push('link') },
    { key: 'delete-account', label: '회원 탈퇴', destructive: true, onPress: () => calls.push('confirmation') },
  ] });
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  assert.equal(nodes(tree).find(node => node.type === 'Host').props.ignoreSafeArea, 'container');
  assert.equal(buttons.length, 3, '최신 버전 행에는 스토어 액션을 만들지 않는다');
  assert.ok(buttons.every(button => button.props.children.props.modifiers.some((modifier: any) =>
    modifier.name === 'contentShape' && modifier.value.shape === 'rectangle')), '글자 외의 행 여백도 같은 탭 영역이다');
  buttons.forEach(button => button.props.onPress());
  assert.deepEqual(calls, ['confirmation']);
  assert.equal(buttons[2].props.role, 'destructive');
});

test('설정 화면은 네이티브 행에서도 업데이트·테마·로그인 연결·탈퇴 확인 조건을 보존한다', () => {
  let hasUpdate = false, storeOpens = 0, deletes = 0;
  const modes: string[] = [], alerts: any[][] = [], routes: string[] = [];
  const user = { identities: [{ provider: 'email' }, { provider: 'kakao' }] };
  const module = loadModule<any>('app/settings.tsx', {
    ...deps,
    react: { useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {} },
    'react-native': { Platform: { OS: 'ios' }, ScrollView: 'Scroll', View: 'View', Text: 'Text',
      Pressable: 'Pressable', Switch: 'Switch', StyleSheet: { create: (s: any) => s } },
    'expo-router': { router: { push: (path: string) => routes.push(path), replace() {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 60, bottom: 30 }) },
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@expo/vector-icons/Ionicons': exported('Icon'),
    '@/hooks/useAppUpdate': { useAppUpdate: () => ({ current: '1.2.11', hasUpdate, openStore: () => storeOpens++ }) },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user }) },
    '@/stores/useThemeStore': { useThemeStore: () => ({ mode: 'system', setMode: (mode: string) => modes.push(mode) }) },
    '@/stores/useHapticsStore': { useHapticsStore: (select: any) => select({ enabled: true, setEnabled() {} }) },
    '@/lib/api/account': { deleteAccount: () => { deletes++; } }, '@/lib/toast': {},
    '@/lib/dialog': { appAlert: (...args: any[]) => alerts.push(args) },
    '@/lib/supabase': {}, '@/lib/socialAuthError': {}, '@/lib/haptics': { haptics: {} },
    '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
    '@/components/ui/NativeSettingsGroup': exported('NativeGroup'),
  });
  let tree = module.default();
  const rows = () => nodes(tree).filter(node => node.type === 'NativeGroup').flatMap(node => Array.from(node.props.rows)) as any[];
  assert.equal(rows().find(row => row.key === 'version').onPress, undefined);
  hasUpdate = true; tree = module.default();
  rows().find(row => row.key === 'version').onPress(); assert.equal(storeOpens, 1);
  nodes(tree).find(node => node.type === 'NativeChoice').props.onChange('dark');
  assert.deepEqual(modes, ['dark']);
  rows().find(row => row.key === 'terms').onPress(); assert.deepEqual(routes, ['/legal/terms']);
  rows().find(row => row.key === 'delete-account').onPress();
  assert.equal(alerts.length, 1); assert.equal(deletes, 0);
  alerts[0][2][1].onPress(); assert.equal(alerts.length, 2); assert.equal(deletes, 0);
  const login = nodes(tree).find(node => typeof node.type === 'function');
  const methods = nodes(login.type(login.props));
  assert.equal(methods.filter(node => node.type === 'Icon' && node.props.name === 'checkmark-circle').length, 2);
  const actions = methods.filter(node => node.type === 'Pressable');
  assert.ok(actions.length > 0);
  assert.ok(actions.every(node => node.props.accessibilityRole === 'button' &&
    nodes(node).some(child => child.props.children === '연결')));

});

test('UIKit 선택 모듈은 native41 capability와 실제 view가 모두 있을 때만 로드한다', () => {
  for (const [version, features, installed, expected] of [
    [40, ['native_ui_controls', 'native_segmented_controls'], true, false],
    [41, ['native_ui_controls'], true, false],
    [41, ['native_ui_controls', 'native_segmented_controls'], false, false],
    [41, ['native_ui_controls', 'native_segmented_controls'], true, true],
  ] as const) {
    const control = () => null;
    const module = loadModule<any>('lib/nativeUI.ts', {
      'react-native': { Platform: { OS: 'ios' }, UIManager: { getViewManagerConfig: () => installed ? {} : null } },
      expo: { requireOptionalNativeModule: (name: string) => name === 'KakaoNavi' ? { bridgeVersion: version, features } : {} },
      '@expo/ui/swift-ui': views, '@expo/ui/swift-ui/modifiers': modifiers,
      ...(expected ? { '@react-native-segmented-control/segmented-control': { default: control } } : {}),
    });
    assert.equal(module.NativeSegmentedControl, expected ? control : null);
  }
});

test('UIKit 세그먼트는 실제44pt·큰 글자 높이를 갖고 잘못된 선택과 비활성을 무시한다', () => {
  const Control = () => null; let changes = 0;
  const module = loadModule<any>('components/ui/NativeChoiceControl.tsx', {
    ...deps, 'react-native': { useWindowDimensions: () => ({ fontScale: 1.5 }) },
    '@/lib/nativeUI': { nativeUI: { views, modifiers }, NativeSegmentedControl: Control },
  });
  const props = { presentation: 'segmented', value: 'a', label: '활동 종류', options: [
    { value: 'a', label: '내 제보' }, { value: 'b', label: '알림 2', accessibilityLabel: '읽지 않은 알림2개' },
  ], onChange: () => changes++ };
  const tree = module.default(props);
  assert.equal(tree.type, Control); assert.equal(tree.props.style.height, 54);
  assert.equal(tree.props.fontStyle.fontFamily, 'Pretendard-Medium');
  assert.equal(tree.props.activeFontStyle.fontFamily, 'Pretendard-SemiBold');
  assert.equal(tree.props.accessibilityHint, '읽지 않은 알림2개');
  assert.deepEqual(Array.from(tree.props.values), ['내 제보', '알림 2'], '접근성 설명을 보이는 라벨로 늘이지 않는다');
  tree.props.onChange({ nativeEvent: { selectedSegmentIndex: -1 } });
  tree.props.onChange({ nativeEvent: { selectedSegmentIndex: 0 } });
  assert.equal(changes, 0);
  tree.props.onChange({ nativeEvent: { selectedSegmentIndex: 1 } }); assert.equal(changes, 1);
  module.default({ ...props, enabled: false }).props.onChange({ nativeEvent: { selectedSegmentIndex: 1 } });
  assert.equal(changes, 1);
});

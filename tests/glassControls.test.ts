import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });
const native = { Pressable: 'Button', View: 'View', Text: 'Text', StyleSheet: { create: (s: any) => s } };

test('Glass 버튼은 native 상호작용을 켜고 폴백일 때만 눌림 투명도를 적용한다', () => {
  const module = loadModule<any>('components/ui/GlassButton.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, './GlassSurface': exported('Glass'),
  });
  let calls = 0;
  const tree = module.default({ children: 'icon', style: { width: 44 }, accessibilityLabel: '설정', onPress: () => calls++ });
  assert.equal(tree.props.interactive, true);
  const button = tree.props.children(true);
  assert.equal(button.props.style({ pressed: true })[1].opacity, 1);
  assert.equal(tree.props.children(false).props.style({ pressed: true })[1].opacity, 0.7);
  button.props.onPress(); assert.equal(calls, 1);
  assert.equal(button.props.accessibilityLabel, '설정');
  const regular = module.default({ children: 'icon', glassEffectStyle: 'regular' });
  assert.equal(regular.props.glassEffectStyle, 'regular');
  assert.equal(regular.props.children(true).props.glassEffectStyle, undefined);
  const onLayout = () => {};
  const measured = module.default({ children: 'icon', onLayout });
  assert.equal(measured.props.onLayout, onLayout);
  assert.equal(measured.props.children(true).props.onLayout, undefined, '절대 위치의 측정은 표면에서 받는다');
  const disabled = module.default({ children: 'icon', disabled: true });
  assert.equal(disabled.props.interactive, false);
  assert.equal(disabled.props.children(false).props.disabled, true);
  const compact = module.default({ children: 'icon', compact: true });
  assert.equal(compact.props.children(true).props.style({ pressed: false })[2].minWidth, 36);
  assert.equal(compact.props.children(true).props.style({ pressed: false })[2].minHeight, 36);
});

test('스와이프는 삭제 버튼만 드러내며 확인 전이나 취소 시에는 삭제하지 않는다', () => {
  const alerts: any[] = [];
  let deleted = 0, closed = 0;
  const module = loadModule<any>('components/activity/SwipeDeleteRow.tsx', {
    react: { useRef: () => ({ current: { close: () => closed++ } }) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'react-native-gesture-handler/ReanimatedSwipeable': exported('Swipe'),
    '@expo/vector-icons/Ionicons': exported('Icon'), '@/constants/Colors': { semantic: { danger: 'red' } },
    '@/lib/dialog': { appAlert: (...args: any[]) => alerts.push(args) },
  });
  const tree = module.default({ label: '제보 목록에서 삭제', message: '내 목록에서만 숨겨요.', children: () => 'row', onDelete: () => deleted++ });
  assert.equal(tree.props.overshootRight, false); assert.equal(tree.props.onSwipeableOpen, undefined);
  const action = tree.props.renderRightActions(); assert.equal(deleted, 0);
  action.props.onPress(); assert.equal(deleted, 0); assert.equal(closed, 1);
  const buttons = alerts[0][2]; assert.equal(buttons[0].style, 'cancel');
  buttons[1].onPress(); assert.equal(deleted, 1);
  const busy = module.default({ busy: true, label: '리뷰 삭제', children: () => 'row', onDelete: () => deleted++ });
  assert.equal(busy.props.enabled, false); assert.equal(busy.props.renderRightActions().props.disabled, true);
});

test('Blur 모듈이 없는 설치본은 native view를 로드하지 않고 불투명 헤더를 유지한다', () => {
  let nativeLoads = 0;
  const module = loadModule<any>('components/ui/HeaderBackdrop.tsx', {
    '@/components/navigation/headerScroll': { useHeaderScrolled: () => false },
    expo: { requireOptionalNativeModule: () => null }, react: { useState: () => [true], useEffect() {} },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { ...native, Platform: { OS: 'ios' } },
    '@/constants/Colors': exported({ light: { background: 'white' } }), '@/components/useColorScheme': { useColorScheme: () => 'light' },
    'expo-blur': { get BlurView() { nativeLoads++; return 'Blur'; } },
  });
  const tree = module.default(); assert.equal(nativeLoads, 0); assert.equal(tree.props.style[1].backgroundColor, 'white');
});

test('고정 헤더는 맨 위에서 단색이며 스크롤했을 때만 약한 반투명 배경을 표시한다', async () => {
  let state = true, effect: any, scrolled = false;
  const module = loadModule<any>('components/ui/HeaderBackdrop.tsx', {
    expo: { requireOptionalNativeModule: () => ({}) },
    react: { useState: () => [state, (value: boolean) => { state = value; }], useEffect: (fn: any) => { effect = fn; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...native, Platform: { OS: 'ios' }, AccessibilityInfo: {
      addEventListener: () => ({ remove() {} }), isReduceTransparencyEnabled: async () => false,
    } },
    '@/constants/Colors': exported({ light: { background: '#FFFFFF' } }), '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/components/navigation/headerScroll': { useHeaderScrolled: () => scrolled },
    'expo-blur': { BlurView: 'Blur' },
  });
  module.default(); effect(); await Promise.resolve();
  let tree = module.default();
  assert.equal(tree.props.children, false, '미스크롤 상태에 blur를 미리 그리지 않는다');
  assert.equal(tree.props.style[1].backgroundColor, '#FFFFFF');
  scrolled = true; tree = module.default();
  assert.equal(tree.props.children.type, 'Blur'); assert.ok(tree.props.children.props.intensity <= 20);
});

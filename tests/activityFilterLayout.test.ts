import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });

function loadFilter(os: 'android' | 'ios', hasDropdown = false) {
  return loadModule<any>('components/activity/SubmissionFilterMenu.tsx', {
    react: { useEffect() {}, useRef: (v: any) => ({ current: v }), useState: (v: any) => [v, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: os }, View: 'View', Text: 'Text', Pressable: 'Button', Modal: 'Modal',
      StyleSheet: { create: (s: any) => s }, useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 60, bottom: 34 }) },
    '@expo/vector-icons/Ionicons': exported('Icon'), '@/constants/Colors': exported({ light: {} }),
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/nativeUI': { nativeUI: os === 'ios' ? {} : null },
    '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
    ...(hasDropdown && { './AndroidSubmissionFilterMenu': exported('AndroidMenu') }),
  }, { expo: { getViewConfig: () => hasDropdown ? {} : null } });
}

test('iOS 활동 탭이 비활성화되어도 같은 네이티브 필터를 유지한다', () => {
  const module = loadFilter('ios');
  const active = module.default({ value: 'all', active: true, onChange() {} });
  const inactive = module.default({ value: 'all', active: false, onChange() {} });
  assert.equal(active.type, 'NativeChoice'); assert.equal(inactive.type, active.type);
  assert.equal(inactive.props.enabled, false);
});

test('Android 필터는 등록된 Material 드롭다운에 기존 선택과 활성 상태를 전달한다', () => {
  const module = loadFilter('android', true);
  const onChange = () => {};
  const menu = module.default({ value: 'feedback', active: false, onChange });
  assert.equal(menu.type, 'AndroidMenu');
  assert.equal(menu.props.value, 'feedback');
  assert.equal(menu.props.selectedLabel, '건의');
  assert.equal(menu.props.onChange, onChange);
  assert.equal(menu.props.active, false);
});

test('Android 네이티브 드롭다운이 없는 빌드에서는 기존 앵커 메뉴를 사용한다', () => {
  const module = loadFilter('android');
  const menu = module.default({ value: 'places', active: true, onChange() {} });
  assert.equal(menu.type, 'Fragment');
  assert.equal(menu.props.children[0].props.accessibilityValue.text, '장소');
  assert.equal(menu.props.children[1].type, 'Modal');
});

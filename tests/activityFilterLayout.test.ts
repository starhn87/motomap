import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });
test('활동 탭이 비활성화되어도 같은 네이티브 필터를 유지해 재진입 측정을 유발하지 않는다', () => {
  const module = loadModule<any>('components/activity/SubmissionFilterMenu.tsx', {
    react: { useEffect() {}, useRef: (v: any) => ({ current: v }), useState: (v: any) => [v, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Button', Modal: 'Modal', StyleSheet: { create: (s: any) => s }, useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 60, bottom: 34 }) },
    '@expo/vector-icons/Ionicons': exported('Icon'), '@/constants/Colors': exported({ light: {} }),
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/nativeUI': { nativeUI: {} }, '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
  });
  const active = module.default({ value: 'all', active: true, onChange() {} });
  const inactive = module.default({ value: 'all', active: false, onChange() {} });
  assert.equal(active.type, 'NativeChoice'); assert.equal(inactive.type, active.type);
  assert.equal(inactive.props.enabled, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });
const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style ?? {};

test('등록·일반 장소 액션은 풀 확장만 Glass이며 크기·즐겨찾기 색·별 애니메이션을 유지한다', () => {
  let favorites = 0, closes = 0;
  const module = loadModule<any>('components/map/PlaceSheetHeaderActions.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@expo/vector-icons/Ionicons': exported('Icon'),
    'react-native': { StyleSheet: { create: (s: any) => s } },
    'react-native-gesture-handler': { TouchableOpacity: 'TouchableOpacity' },
    'react-native-reanimated': { ...exported({ View: 'Animated' }), useAnimatedStyle: (fn: any) => fn() },
    '@/components/ui/GlassButton': exported('GlassButton'), '@/components/ui/CloseIcon': exported('Close'),
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/constants/Colors': { ...exported({ light: { text: 'black', textSecondary: 'gray' } }), semantic: { star: 'yellow' } },
  });
  for (const expanded of [false, true]) {
    const tree = module.default({ expanded, isFavorite: true, favoriteScale: { value: 1.2 },
      onFavorite: () => favorites++, onClose: () => closes++ });
    const [favorite, close] = tree.props.children;
    assert.equal(favorite.type, expanded ? 'GlassButton' : 'TouchableOpacity');
    assert.equal(close.type, expanded ? 'GlassButton' : 'TouchableOpacity');
    assert.equal(flatten(favorite.props.style).width, expanded ? 44 : 36);
    assert.equal(favorite.props.children.props.children.props.color, 'yellow');
    assert.equal(favorite.props.children.props.style.transform[0].scale, 1.2);
    assert.equal(close.props.accessibilityLabel, '장소 상세 닫기');
    favorite.props.onPress(); close.props.onPress();
  }
  assert.equal(favorites, 2); assert.equal(closes, 2);
});

test('뒤로 글리프는 크기를 유지하며 같은 작은 왼쪽 보정만 적용한다', () => {
  const module = loadModule<any>('components/ui/BackIcon.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@expo/vector-icons/Ionicons': exported('Icon'),
    'react-native': { StyleSheet: { create: (s: any) => s } },
  });
  for (const size of [24, 26, 28]) {
    const tree = module.default({ size, color: 'black' });
    assert.equal(tree.props.name, 'chevron-back'); assert.equal(tree.props.size, size);
    assert.equal(tree.props.style.transform[0].translateX, -1.5);
  }
});

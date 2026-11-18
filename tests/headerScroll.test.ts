import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });

test('헤더는 스크롤 경계를 넘을 때만 갱신하고 숨긴 목록은 다른 섹션의 상태를 바꾸지 않는다', () => {
  let scrolled = false, updates = 0, previous: any[] | undefined;
  const ref = { current: { scrolled: false, resetKey: undefined as string | undefined } };
  const context = { scrolled, setScrolled: (value: boolean) => { scrolled = value; updates++; } };
  const module = loadModule<any>('components/navigation/headerScroll.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { createContext: () => ({}), useContext: () => context, useRef: () => ref,
      useEffect: (fn: () => void, deps: any[]) => { if (!previous || deps.some((value, i) => value !== previous![i])) { previous = deps; fn(); } }, useState() {} },
  });
  const offset = (fn: any, y: number) => fn({ nativeEvent: { contentOffset: { y } } });
  let track = module.useTrackHeaderScroll(true); assert.equal(scrolled, false);
  offset(track, 12); assert.equal(scrolled, true);
  const before = updates; offset(track, 13); offset(track, 80); assert.equal(updates, before);
  track = module.useTrackHeaderScroll(false); offset(track, 0); assert.equal(scrolled, true);
  track = module.useTrackHeaderScroll(true); assert.equal(scrolled, false, '선택한 목록 위치로 복원');
  offset(track, -30); assert.equal(scrolled, false, 'pull-to-refresh는 스크롤로 보지 않는다');
  offset(track, 40); assert.equal(scrolled, true);
  track = module.useTrackHeaderScroll(true, { resetKey: 'feedback', hasContent: false });
  assert.equal(scrolled, false, '빈 분류로 바꾸면 이전 목록의 블러가 남지 않는다');
  offset(track, 40); assert.equal(scrolled, false);
});

test('지도 검색 진입은 regular Glass이며 불투명 배경 없이 검색·마이크 터치를 분리한다', () => {
  const calls: string[] = [];
  const module = loadModule<any>('components/search/SearchEntry.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Button', StyleSheet: { create: (s: any) => s, hairlineWidth: 0.5 } },
    '@expo/vector-icons/Ionicons': exported('Icon'), 'expo-router': { router: { push: (path: string) => calls.push(path) } },
    '@/constants/Colors': exported({ light: { background: '#FFFFFF', border: '#EEE' } }),
    '@/components/useColorScheme': { useColorScheme: () => 'light' }, '@/hooks/useVoiceSearch': { useVoiceSearch: () => ({ listening: false, toggle: () => calls.push('voice') }) },
    '@/lib/analytics': {},
    '@/components/ui/GlassSurface': exported('Glass'),
  });
  const tree = module.default(); assert.equal(tree.type, 'Glass');
  assert.equal(tree.props.glassEffectStyle, 'regular'); assert.equal(tree.props.interactive, true);
  assert.equal(tree.props.style.backgroundColor, undefined);
  const [search, voice] = tree.props.children(true).props.children;
  assert.equal(search.type, 'Button'); assert.equal(voice.type, 'Button');
  search.props.onPress(); voice.props.onPress(); assert.deepEqual(calls, ['/search', 'voice']);
  assert.equal(search.props.style({ pressed: true })[1].opacity, 1);
});

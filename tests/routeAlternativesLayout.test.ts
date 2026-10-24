import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

// 실제 카드의 onLayout/선택 handler를 실행해 화면 폭 변경 후에도 다음 카드가 보이는지 확인한다.
test('경로 카드는 두 장 뒤 세번째가 28pt 보이고 선택 스크롤도 실측 폭을 따른다', () => {
  const slots: any[] = [], effects: (() => void)[] = [], offsets: number[] = [], selected: number[] = [];
  let cursor = 0;
  const react = {
    useState(initial: any) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: any) => { slots[index] = value; }]; },
    useRef() { const [ref] = react.useState({ current: { scrollTo: ({ x }: { x: number }) => offsets.push(x) } }); return ref; },
    useEffect(fn: () => void) { effects.push(fn); },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const { default: Component } = loadModule<{ default: (props: any) => any }>('components/navi/RouteAlternatives.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'Spinner', StyleSheet: { create: (value: any) => value } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/api/directions': { formatMeters: String, formatSeconds: String },
  });
  const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
  let priority = 0;
  const render = () => {
    cursor = 0;
    const tree = Component({ options: [0, 1, 2, 3, 4].map(value => ({ value, label: String(value), loading: true })), priority,
      requestedViaCount: 0, disabled: false, onSelect: (value: number) => selected.push(value) });
    effects.splice(0).forEach(fn => fn());
    return tree;
  };
  let tree = render();
  for (const width of [280, 350, 390]) {
    tree.props.onLayout({ nativeEvent: { layout: { width } } }); tree = render();
    const cards = nodes(tree).filter(node => node.type === 'Pressable');
    const cardWidth = cards[0].props.style[1].width;
    assert.equal(width - cardWidth * 2 - 16, 28);
    assert.equal(nodes(tree).find(node => node.type === 'ScrollView').props.horizontal, true);
    cards[2].props.onPress(); priority = 2; tree = render();
    assert.equal(offsets.at(-1), 2 * (cardWidth + 8));
  }
  assert.deepEqual(selected, [2, 2, 2]);
});

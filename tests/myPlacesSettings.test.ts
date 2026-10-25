import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup() {
  let editing: any = null, dialog: any;
  const saved = { home: { name: '비공개 집', address: '비공개 주소', latitude: 37.5, longitude: 127 } } as Record<string, any>;
  const writes: string[] = [];
  const store = { places: saved, load() {}, save(slot: string, point: any) { writes.push(slot); saved[slot] = point; }, remove(slot: string) { delete saved[slot]; } };
  const jsx = (type: any, props: any) => ({ type, props });
  const module = loadModule<{ default: () => any }>('components/settings/MyPlacesSettings.tsx', {
    react: { useState: () => [editing, (value: any) => { editing = value; }], useEffect: (run: () => void) => run() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: (s: any) => s } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/stores/useMyPlacesStore': { useMyPlacesStore: (select: any) => select(store) },
    '@/components/search/PointSearchModal': { __esModule: true, default: 'PointSearchModal' },
    '@/lib/dialog': { appAlert: (...args: any[]) => { dialog = args; } },
    '@/lib/toast': { toast: { success() {} } },
  });
  const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
  const tree = () => module.default();
  const row = (index: number) => nodes(tree()).filter(n => n.type === 'Pressable')[index];
  const modal = () => nodes(tree()).find(n => n.type === 'PointSearchModal').props;
  return { saved, writes, tree, row, modal, dialog: () => dialog };
}

test('로그인 의존성 없이 집·회사를 관리하고 취소는 기존 값을 보존한다', () => {
  const s = setup(), home = s.saved.home;
  assert.ok(!JSON.stringify(s.tree()).includes(home.name));
  s.row(1).props.onPress();
  assert.equal(s.modal().visible, true); assert.equal(s.modal().confirmSlot, 'work');
  s.modal().onClose(); assert.equal(s.modal().visible, false); assert.equal(s.writes.length, 0);
  s.row(1).props.onPress();
  s.modal().onSelect({ name: '회사', latitude: 37.6, longitude: 127.1 }, '회사 주소');
  assert.deepEqual(s.writes, ['work']); assert.equal(s.saved.work.address, '회사 주소'); assert.equal(s.saved.home, home);
});

test('기존 장소의 변경·삭제는 개인정보 마스킹된 확인 동작을 거친다', () => {
  const s = setup();
  s.row(0).props.onPress();
  const dialog = s.dialog();
  assert.equal(dialog[3].maskMessage, true);
  assert.equal(s.saved.home.name, '비공개 집');
  dialog[2].find((action: any) => action.text === '변경').onPress();
  assert.equal(s.modal().confirmSlot, 'home'); s.modal().onClose();
  assert.equal(s.saved.home.name, '비공개 집');
  dialog[2].find((action: any) => action.text === '삭제').onPress();
  assert.equal(s.saved.home, undefined);
});

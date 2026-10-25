import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup(available = true, copied = true) {
  const writes: string[] = [], success: string[] = [], errors: string[] = [], calls: string[] = [];
  const jsx = (type: any, props: any) => ({ type, props });
  const mod = loadModule<any>('components/place/PlaceContactRows.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable', StyleSheet: { create: (s: any) => s }, Linking: { openURL: async (value: string) => { calls.push(value); } } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/addressClipboard': { canCopyAddress: available, copyAddress: async (address: string) => { writes.push(address); return copied; } },
    '@/lib/toast': { toast: { success: (s: string) => success.push(s), error: (s: string) => errors.push(s), info() {} } },
  });
  return { mod, writes, success, errors, calls };
}
const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('주소 옆 복사 아이콘을 누른 뒤에만 전체 주소를 복사하고 성공을 알린다', async () => {
  const s = setup(), address = '서울 아주 긴 테스트 주소 전체 123';
  const tree = s.mod.PlaceAddressRow({ address });
  assert.equal(s.writes.length, 0);
  nodes(tree).find(n => n.props.accessibilityLabel === '주소 복사').props.onPress(); await flush();
  assert.deepEqual(s.writes, [address]); assert.equal(s.success.length, 1); assert.equal(s.errors.length, 0);
});
test('구 설치본에 동작하지 않는 버튼을 노출하지 않고 복사 실패를 성공으로 알리지 않는다', async () => {
  const old = setup(false), tree = old.mod.PlaceAddressRow({ address: '주소' });
  assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === '주소 복사'), false);
  assert.equal(nodes(tree).find(n => n.type === 'Text').props.selectable, true);
  const failed = setup(true, false);
  nodes(failed.mod.PlaceAddressRow({ address: '주소' })).find(n => n.props.accessibilityLabel === '주소 복사').props.onPress(); await flush();
  assert.equal(failed.success.length, 0); assert.equal(failed.errors.length, 1);
});
test('전화 행을 누르면 기존 전화번호로 연결하고 번호가 없으면 표시하지 않는다', async () => {
  const s = setup(); assert.equal(s.mod.PlacePhoneRow({}), null);
  const row = s.mod.PlacePhoneRow({ phone: '02-123-4567' });
  assert.equal(s.calls.length, 0); row.props.onPress(); await flush();
  assert.deepEqual(s.calls, ['tel:02-123-4567']);
});

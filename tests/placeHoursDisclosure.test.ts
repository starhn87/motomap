import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDailyHours } from '../lib/hours';
import { loadModule } from './helpers/loadModule';
import * as hours from '../lib/hours';

function ui() {
  const jsx = (type: any, props: any) => ({ type, props });
  const badge = loadModule<any>('components/place/OpenBadge.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Text: 'Text', View: 'View', StyleSheet: { create: (s: any) => s } },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/hours': hours,
  });
  return loadModule<any>('components/place/PlaceHoursDisclosure.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ActivityIndicator: 'Spinner', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (s: any) => s } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/components/place/OpenBadge': badge,
    '@/lib/hours': hours,
  });
}
const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const text = (node: any): string => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';

test('요일별 시간은 월~일 모두 표시하며 미확인 요일과 확정 휴무를 구분한다', () => {
  const days = formatDailyHours({ mon: [{ open: '11:00', close: '02:00' }], tue: [], wed: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '18:00' }] });
  assert.equal(days.length, 7); assert.equal(days[0].label, '월'); assert.equal(days[0].value, '11:00-02:00');
  assert.equal(days[1].value, '휴무'); assert.equal(days[2].value, '09:00-12:00, 13:00-18:00'); assert.equal(days[3].value, '정보 없음');
  assert.deepEqual(formatDailyHours({ note: '우천 휴무' }), []);
});
test('접힌 시간표는 숨기고 펼침/접기 버튼은 반대 화살표와 접근성 상태로 바뀐다', () => {
  const mod = ui(); let expanded = false;
  const button = () => mod.PlaceHoursToggle({ expanded, onToggle: () => { expanded = !expanded; } });
  assert.equal(mod.PlaceHoursDetails({ expanded }), null);
  assert.equal(nodes(button()).filter(n => n.type === 'Icon').at(-1).props.name, 'chevron-down');
  button().props.onPress();
  assert.equal(button().props.accessibilityState.expanded, true);
  assert.equal(nodes(button()).filter(n => n.type === 'Icon').at(-1).props.name, 'chevron-up');
  assert.ok(text(mod.PlaceHoursDetails({ expanded, hours: { mon: [] } })).includes('월요일'));
  assert.ok(text(mod.PlaceHoursDetails({ expanded, hours: { mon: [] } })).includes('휴무'));
});
test('시간 정보가 없으면 행 전체를 숨기고 원문 시간표·주의사항은 자르지 않는다', () => {
  const mod = ui();
  for (const value of [undefined, null, {}, { mon: null }, { note: '  ' }]) {
    assert.equal(mod.PlaceHoursRow({ hours: value, expanded: true, onToggle() {} }), null);
    assert.equal(mod.PlaceHoursDetails({ hours: value, expanded: true }), null);
  }
  assert.equal(mod.PlaceHoursRow({ fallbackText: '  ', expanded: false, onToggle() {} }), null);
  assert.ok(mod.PlaceHoursRow({ hours: { mon: [] }, expanded: false, onToggle() {} }));
  assert.ok(mod.PlaceHoursRow({ hours: { note: '우천 휴무' }, expanded: false, onToggle() {} }));
  const fallback = '매일 10:00~20:00\n브레이크 타임 14:00~16:00';
  const tree = mod.PlaceHoursDetails({ expanded: true, fallbackText: fallback, hours: { note: '우천 휴무' } });
  assert.ok(text(tree).includes(fallback)); assert.ok(text(tree).includes('우천 휴무'));
  assert.ok(nodes(tree).filter(n => n.type === 'Text').every(n => n.props.numberOfLines === undefined));
});

test('독립 운영시간 행은 실제 영업 상태와 마감 시각을 보여주고 시간표 없는 폐업은 펼침 없이 표시한다', () => {
  const mod = ui();
  const allDay = Object.fromEntries(hours.WEEK.map(day => [day, [{ open: '00:00', close: '24:00' }]]));
  const tree = mod.PlaceHoursToggle({ hours: allDay, expanded: false, onToggle() {} });
  const badge = nodes(tree).find(n => typeof n.type === 'function' && n.props.inlineStart);
  assert.ok(text(badge.type(badge.props)).includes('영업중 · 24:00 마감'));
  const closed = mod.PlaceHoursRow({ businessStatus: 'CLOSED_PERMANENTLY', expanded: false, onToggle() {} });
  assert.ok(closed);
  assert.ok(!nodes(closed).some(n => n.type === 'Pressable'));
  const closedBadge = nodes(closed).find(n => typeof n.type === 'function' && n.props.inlineStart);
  assert.ok(text(closedBadge.type(closedBadge.props)).includes('폐업'));
});

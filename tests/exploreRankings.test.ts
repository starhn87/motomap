import assert from 'node:assert/strict';
import test from 'node:test';
import { displayedRating, rankRecommendedPlaces, rankReviewedPlaces } from '../lib/exploreRankings';
import type { GeneralPlace } from '../lib/api/generalPlaces';
import type { Place } from '../types';
import { loadModule } from './helpers/loadModule';

const general = (id: string, shareCount: number): GeneralPlace => ({
  id, name: id, address: '서울 마포구', provider: 'kakao', providerId: `provider-${id}`,
  latitude: 37.5, longitude: 127, rating: 0, reviewCount: 0, shareCount,
});
const registered = (id: string, rating: number, reviewCount: number): Place => ({
  id, name: id, address: '경기 양평군', category: 'cafe', latitude: 37.5, longitude: 127,
  rating, reviewCount, photos: [], tags: [], description: '', submittedBy: 'fixture', approved: true, createdAt: '2026-11-02T00:00:00Z',
});

test('공개 추천수만으로 정렬하고 동률은 공동 순위이며 입력 배열을 바꾸지 않는다', () => {
  const input = [general('low', 1), general('second', 3), general('first', 3)];
  assert.deepEqual(rankRecommendedPlaces(input).map(item => [item.place.id, item.rank]), [['first', 1], ['second', 1], ['low', 3]]);
  assert.equal(input[0].id, 'low');
  assert.equal(rankRecommendedPlaces([general('none', 0), general('bad', NaN), general('fraction', 1.5),
    { ...general('promoted', 100), promotedPlaceId: 'registered' }]).length, 0);
});

test('등록 장소는 유효한 리뷰 평점으로만 비교하고 리뷰 수는 같은 평점 내 배치에만 사용한다', () => {
  const input = [registered('small', 4.51, 1), registered('many', 4.54, 50), registered('lower', 4.3, 100)];
  assert.deepEqual(rankReviewedPlaces(input).map(item => [item.place.id, item.rank]), [['many', 1], ['small', 1], ['lower', 3]]);
  assert.equal(displayedRating(4.54), 4.5);
  assert.equal(rankReviewedPlaces([registered('unreviewed', 5, 0), registered('invalid', 8, 1),
    { ...registered('pending', 5, 2), approved: false }]).length, 0);
});

type Element = { type: any; props: any };
function nodes(node: any): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node?.props ? [node, ...nodes(node.props.children)] : [];
}
function fixture() {
  let cursor = 0;
  const state: any[] = [];
  const query = (data: any[]) => ({ data, isLoading: false, isError: false, isFetching: false, isRefetching: false, refetch: () => Promise.resolve() });
  const shared = query([general('public', 5), general('test주유소', 9)]);
  const rated = query([registered('cafe', 4.9, 3)]);
  const guides = query([]);
  const focused: any[] = [];
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) },
    react: { useRef: () => ({ current: null }), useState: (initial: any) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: any) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } },
    'react-native': { FlatList: 'List', Pressable: 'Button', View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', RefreshControl: 'Refresh', StyleSheet: { create: (value: any) => value, hairlineWidth: 0.5 } },
    '@expo/vector-icons/Ionicons': 'Icon',
    '@tanstack/react-query': { useQuery: () => rated }, 'expo-router': { router: { push() {}, navigate() {} } },
    '@/constants/Colors': { __esModule: true, default: { light: { text: 'black', textSecondary: 'gray' } }, semantic: { star: 'yellow' } },
    '@/constants/categories': { CATEGORIES: { cafe: { label: '카페' } } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' }, '@/components/ui/CategoryIcon': 'Category',
    '@/components/ui/Skeleton': 'Skeleton', '@/components/ui/EmptyState': 'Empty',
    '@/components/navigation/NativeTabScreen': { withNativeTabScreen: (screen: unknown) => screen },
    '@/components/navigation/tabOcclusion': { TabScrollSpacer: () => null },
    '@/hooks/useCommunityPlaceSignals': { useSharedGeneralPlaces: () => shared }, '@/hooks/useRidingGuides': { useRidingGuides: () => guides },
    '@/lib/api/places': { fetchAllPlaces() {} }, '@/lib/api/gasStations': { looksLikeGasStation: (name: string) => name.includes('주유소') },
    '@/lib/exploreRankings': { rankRecommendedPlaces, rankReviewedPlaces, displayedRating },
    '@/lib/mapFocus': { focusPlaceOnMap: (...args: any[]) => focused.push(['registered', ...args]), focusPointOnMap: (point: any) => focused.push(['general', point]) },
  };
  const screen = loadModule<{ default: () => Element }>('app/(tabs)/courses.tsx', dependencies).default;
  const render = () => { cursor = 0; return screen(); };
  const select = (label: string) => {
    const view = render();
    const button = nodes(view.props.ListHeaderComponent).find(node => node.type === 'Button' && node.props.children?.props?.children === label);
    assert.ok(button, label);
    button.props.onPress();
    return render();
  };
  return { render, select, shared, rated, focused };
}

test('탐색 첫 화면은 추천순이며 일반·등록 장소를 섞지 않고 원래 지도 상세로 연결한다', () => {
  const app = fixture();
  let view = app.render();
  assert.equal(view.props.data.length, 1, '주유소 추천은 제외');
  let element = view.props.renderItem({ item: view.props.data[0] });
  element = element.type(element.props);
  element.props.onPress();
  assert.equal(app.focused[0][1].generalPlaceId, 'public');
  assert.equal(app.focused[0][1].providerId, 'provider-public');
  view = app.select('평점순');
  assert.equal(view.props.data[0].kind, 'registered');
  element = view.props.renderItem({ item: view.props.data[0] });
  element.type(element.props).props.onPress();
  assert.equal(app.focused[1][1], 'cafe');
  assert.equal(app.focused[1][2].source, 'explore');
  const header = texts(view.props.ListHeaderComponent);
  assert.equal(header.includes('추천순'), true);
  assert.equal(header.includes('평점순'), true);
  assert.equal(header.some(line => line.includes('라이딩') || line.includes('추천 많이') || line.includes('평점 높은')), false);
});
function texts(node: any): string[] {
  if (Array.isArray(node)) return node.flatMap(texts);
  if (typeof node === 'string') return [node];
  return node?.props ? texts(node.props.children) : [];
}

test('로딩·실패·정상 빈 목록을 구분하고 재조회 실패에는 기존 결과를 유지한다', () => {
  const app = fixture();
  app.shared.isLoading = true;
  assert.equal(app.render().props.data.length, 0);
  assert.notEqual(app.render().props.ListEmptyComponent.type, 'Empty');
  app.shared.isLoading = false;
  app.shared.isError = true;
  assert.equal(app.render().props.data.length, 1);
  assert.equal(app.render().props.ListEmptyComponent, null);
  app.shared.data = [];
  assert.equal(app.render().props.ListEmptyComponent, null, '조회 실패를 추천 0건으로 표시하지 않음');
  app.shared.isError = false;
  assert.equal(app.render().props.ListEmptyComponent.type, 'Empty');
});

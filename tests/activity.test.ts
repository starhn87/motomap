import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

type Element = { type: any; props: any; key?: string };
const jsx = (type: any, props: any, key?: string) => ({ type, props, key });
const exported = (value: any) => ({ __esModule: true, default: value });
const nodes = (node: any): Element[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node,
  ...nodes(node.props.children), ...nodes(node.props.ListHeaderComponent), ...nodes(node.props.ListEmptyComponent)] : [];
const colors = { text: 'black', tint: 'black', textSecondary: 'gray', background: 'white', surface: 'surface', surfaceElevated: 'white', border: 'gray', surfaceMuted: 'muted' };
const native = { View: 'View', Text: 'Text', FlatList: 'List', Pressable: 'Button', RefreshControl: 'Refresh', ActivityIndicator: 'Spinner', StyleSheet: { create: (s: any) => s, hairlineWidth: 0.5 } };

function hooks() {
  let cursor = 0;
  const states: any[] = [], effectDeps: any[] = [], callbacks: any[] = [], refs: any[] = [];
  let queued: (() => any)[] = [], focusCallback: unknown;
  const equal = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  return {
    react: {
      useState: (initial: any) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
      useRef: (initial: any) => { const i = cursor++; return refs[i] ??= { current: initial }; },
      useCallback: (fn: any, deps: any[]) => { const i = cursor++; if (!equal(callbacks[i]?.deps, deps)) callbacks[i] = { fn, deps }; return callbacks[i].fn; },
      useEffect: (fn: () => any, deps: any[]) => { const i = cursor++; if (!equal(effectDeps[i], deps)) { queued.push(fn); effectDeps[i] = deps; } },
    },
    focusEffect: (fn: () => void) => { if (fn !== focusCallback) { queued.push(fn); focusCallback = fn; } },
    render<T>(fn: () => T): T { cursor = 0; const tree = fn(); const effects = queued; queued = []; effects.forEach(effect => effect()); return tree; },
  };
}

for (const nativeEnabled of [false, true]) test(`활동은 로그인·방문·포커스 경계를 지킨다 (native=${nativeEnabled})`, () => {
  let user: any = null, focused = true;
  const state = hooks();
  const module = loadModule<any>('components/activity/ActivityScreen.tsx', {
    react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@/components/navigation/headerInset': { HeaderInsetContext: { Provider: 'HeaderInset' }, useContentHeaderInset: () => 52 },
    '@/components/ui/HeaderBackdrop': exported('Backdrop'),
    '@/lib/nativeUI': { nativeUI: nativeEnabled ? {} : null }, '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
    './SwipeDeleteRow': exported('SwipeDelete'),
    '@/hooks/useActivityActions': { useActivityDismissals: () => ({ data: [], refetch() {} }), useDismissSubmission: () => ({ mutate() {} }), useDeleteActivityNotification: () => ({ mutate() {} }), useDeleteActivityReview: () => ({ mutate() {} }) },
    'expo-router': { useIsFocused: () => focused },
    '@/constants/Colors': exported({ light: colors }), '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user }) }, '@/hooks/useNotifications': { useUnreadCount: () => 2 },
    '@/components/auth/LoginPrompt': exported('Login'), './MySubmissionsList': exported('Submissions'), './MyReviewsList': exported('Reviews'), './NotificationsList': exported('Notifications'),
  });
  assert.equal(module.default().type, 'Login');
  user = { id: 'actor-a' };
  const content = module.default(); assert.equal(content.key, 'actor-a');
  const render = () => state.render(() => content.type(content.props));
  let tree = render();
  assert.equal(nodes(tree).some(node => node.type === 'Submissions'), true);
  assert.equal(nodes(tree).some(node => node.type === 'Notifications'), false, '숨긴 알림 사전 마운트 금지');
  const select = (label: string) => {
    if (nativeEnabled) {
      const control = nodes(tree).find(node => node.type === 'NativeChoice')!;
      const key = control.props.options.find((option: any) => option.label.startsWith(label)).value;
      control.props.onChange(key);
    } else nodes(tree).find(node => node.type === 'Button' && node.props.accessibilityLabel.startsWith(label))!.props.onPress();
  };
  select('리뷰'); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'Submissions')?.props.active, false);
  assert.equal(nodes(tree).find(node => node.type === 'Reviews')?.props.active, true);
  select('알림'); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'Notifications')?.props.active, true);
  assert.equal(nodes(tree).find(node => node.type === 'Reviews')?.props.active, false);
  assert.equal(nodes(tree).filter(node => ['Submissions', 'Reviews', 'Notifications'].includes(node.type)).length, 3);
  focused = false; tree = render();
  assert.ok(nodes(tree).filter(node => ['Submissions', 'Reviews', 'Notifications'].includes(node.type)).every(node => !node.props.active));
  user = { id: 'actor-b' }; assert.equal(module.default().key, 'actor-b');
});

function notificationFixture() {
  const state = hooks();
  let focused = true, marks = 0, tokens = 0, queryEnabled: unknown;
  let user: any = { id: 'actor-a' };
  const selected: any[] = [], pushed: string[] = [];
  const query = { data: [{ id: 'n1', type: 'place_approved', title: '승인', body: '반영', createdAt: '2026-11-03T10:00:00Z', readAt: null }], isLoading: false, isError: false, refetch() {}, isRefetching: false };
  const markAllRead = () => marks++;
  const module = loadModule<any>('components/activity/NotificationsList.tsx', {
    react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@/components/navigation/headerInset': { HeaderInsetContext: { Provider: 'HeaderInset' }, useContentHeaderInset: () => 52 },
    '@/components/ui/HeaderBackdrop': exported('Backdrop'),
    '@/lib/nativeUI': { nativeUI: null }, '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
    './SwipeDeleteRow': exported('SwipeDelete'),
    '@/hooks/useActivityActions': { useActivityDismissals: () => ({ data: [], refetch() {} }), useDismissSubmission: () => ({ mutate() {} }), useDeleteActivityNotification: () => ({ mutate() {} }), useDeleteActivityReview: () => ({ mutate() {} }) },
    '@expo/vector-icons/MaterialCommunityIcons': exported('Icon'), '@expo/vector-icons/Ionicons': exported('Icon'),
    'expo-router': { router: { push: (url: string) => pushed.push(url), navigate() {} }, useIsFocused: () => focused, useFocusEffect: state.focusEffect, useLocalSearchParams: () => ({}) },
    '@/constants/Colors': exported({ light: colors }), '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/mapFocus': { focusPlaceOnMap: (...args: any[]) => selected.push(args) },
    '@/hooks/useNotifications': { useNotifications: (enabled: boolean) => { queryEnabled = enabled; return query; }, useMarkAllRead: () => ({ mutate: markAllRead }) },
    '@/lib/push': { registerPushToken: () => { tokens++; } }, '@/components/ui/EmptyState': exported('Empty'), '@/components/ui/HighlightPulse': exported('Highlight'),
    '@/components/ui/Skeleton': { ...exported('Skeleton'), SkeletonContainer: 'SkeletonContainer' },
    '@/components/navigation/tabOcclusion': { useTabOcclusion: () => 80 }, '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user }) },
  });
  return { query, selected, pushed, focus(value: boolean) { focused = value; }, logout() { user = null; },
    render: (active: boolean) => state.render(() => module.default({ active })),
    counts: () => ({ marks, tokens, queryEnabled }) };
}

test('보지 않은 알림·백그라운드·로그아웃은 읽음 처리와 알림 권한 요청을 실행하지 않는다', () => {
  const app = notificationFixture();
  app.render(false); assert.deepEqual(app.counts(), { marks: 0, tokens: 0, queryEnabled: false });
  app.focus(false); app.render(true); assert.equal(app.counts().marks, 0); assert.equal(app.counts().tokens, 0);
  app.focus(true); app.render(true); app.render(true);
  assert.equal(app.counts().marks, 1); assert.equal(app.counts().tokens, 1);
  app.render(false); assert.equal(app.counts().marks, 1);
  app.logout(); app.render(true); assert.equal(app.counts().marks, 1); assert.equal(app.counts().queryEnabled, false);
});

test('알림의 장소·기존 코스·라이딩·앱 내 링크 진입과 하단 여백을 유지한다', () => {
  const app = notificationFixture();
  const list = nodes(app.render(true)).find(node => node.type === 'List')!;
  assert.equal(list.props.contentContainerStyle[1].paddingBottom, 96);
  for (const data of [{ placeId: 'place-a' }, { courseId: 'course-a' }, { guideId: 'guide-a' }, { url: '/settings' }]) {
    const highlight = list.props.renderItem({ item: { ...app.query.data[0], data } });
    nodes(highlight.props.children(() => {})).find(node => node.type === 'Button')!.props.onPress();
  }
  assert.equal(app.selected[0][0], 'place-a');
  assert.equal(app.selected[0][1].source, 'notification');
  assert.deepEqual(app.pushed, ['/course/course-a', '/riding/guide-a', '/settings']);
  app.query.isError = true; app.query.data = [];
  assert.equal(app.render(true).props.title, '알림을 불러오지 못했어요');
});

test('리뷰 목록은 사용자별 키·페이지 연결을 유지하고 숨긴 동안 추가 페이지를 요청하지 않는다', () => {
  let user: any = { id: 'actor-a' }, config: any, fetches = 0;
  const module = loadModule<any>('components/activity/MyReviewsList.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@/components/navigation/headerInset': { HeaderInsetContext: { Provider: 'HeaderInset' }, useContentHeaderInset: () => 52 },
    '@/components/ui/HeaderBackdrop': exported('Backdrop'),
    '@/lib/nativeUI': { nativeUI: null }, '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
    './SwipeDeleteRow': exported('SwipeDelete'),
    '@/hooks/useActivityActions': { useActivityDismissals: () => ({ data: [], refetch() {} }), useDismissSubmission: () => ({ mutate() {} }), useDeleteActivityNotification: () => ({ mutate() {} }), useDeleteActivityReview: () => ({ mutate() {} }) }, '@expo/vector-icons/Ionicons': exported('Icon'),
    '@tanstack/react-query': { useInfiniteQuery: (options: any) => { config = options; return { data: { pages: [[{ id: 'r1' }], [{ id: 'r2' }]] }, refetch() {}, fetchNextPage: () => fetches++, hasNextPage: true }; } },
    'expo-router': { router: { navigate() {} } }, '@/components/ui/EmptyState': exported('Empty'),
    '@/constants/Colors': exported({ light: colors }), '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/mapFocus': {}, '@/lib/api/mydata': { fetchMyReviews() {}, MY_REVIEWS_PAGE_SIZE: 20 },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user }) },
    '@/components/ui/Skeleton': { ...exported('Skeleton'), SkeletonContainer: 'SkeletonContainer' },
    '@/components/review/StarRating': exported('Stars'), '@/components/map/PhotoStrip': exported('Photos'), '@/components/navigation/tabOcclusion': { useTabOcclusion: () => 80 },
  });
  let tree = module.default({ active: false });
  assert.deepEqual(Array.from(config.queryKey), ['my-reviews', 'actor-a']); assert.equal(config.enabled, false);
  let list = nodes(tree).find(node => node.type === 'List')!;
  assert.equal(list.props.data.length, 2); list.props.onEndReached(); assert.equal(fetches, 0);
  tree = module.default({ active: true }); assert.equal(config.enabled, true);
  list = nodes(tree).find(node => node.type === 'List')!; list.props.onEndReached(); assert.equal(fetches, 1);
  assert.equal(config.getNextPageParam(new Array(20), [[], []]), 2);
  assert.equal(config.getNextPageParam([], [[], []]), undefined);
  user = null; module.default({ active: true }); assert.equal(config.enabled, false);
});

test('내 제보 전체는 최신순으로 합치고 드롭다운 분류·계정·숨김 조회 경계를 지킨다', () => {
  const state = hooks(); let configs: any[] = [];
  const fixtures: Record<string, any[]> = { 'my-submissions': [], 'my-feedback': [] };
  let hidden: any[] = [];
  const module = loadModule<any>('components/activity/MySubmissionsList.tsx', {
    react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@/components/navigation/headerInset': { HeaderInsetContext: { Provider: 'HeaderInset' }, useContentHeaderInset: () => 52 },
    '@/components/ui/HeaderBackdrop': exported('Backdrop'),
    '@/lib/nativeUI': { nativeUI: null }, '@/components/ui/NativeChoiceControl': exported('NativeChoice'),
    './SwipeDeleteRow': exported('SwipeDelete'),
    './SubmissionFilterMenu': exported('FilterMenu'),
    '@/hooks/useActivityActions': { useActivityDismissals: () => ({ data: hidden, refetch() {} }), useDismissSubmission: () => ({ mutate() {} }), useDeleteActivityNotification: () => ({ mutate() {} }), useDeleteActivityReview: () => ({ mutate() {} }) },
    '@expo/vector-icons/Ionicons': exported('Icon'), '@/components/ui/CategoryIcon': exported('Category'),
    '@tanstack/react-query': { useQuery: (options: any) => { configs.push(options); return { data: fixtures[options.queryKey[0]], refetch() {} }; } },
    'expo-router': { router: { navigate() {}, push() {} } }, '@/components/ui/EmptyState': exported('Empty'),
    '@/constants/Colors': { ...exported({ light: colors }), semantic: {} }, '@/constants/categories': { CATEGORIES: {} },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/api/mydata': { fetchMySubmissions() {} }, '@/lib/api/ridingGuideSubmissions': { fetchMyRidingGuideProposals() {} }, '@/lib/api/feedback': { fetchMyFeedback() {} },
    '@/lib/mapFocus': {}, '@/lib/toast': {}, '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user: { id: 'actor-a' } }) },
    '@/components/ui/Skeleton': { ...exported('Skeleton'), SkeletonContainer: 'SkeletonContainer' }, '@/components/navigation/tabOcclusion': { useTabOcclusion: () => 80 },
  });
  const render = (active: boolean) => { configs = []; return state.render(() => module.default({ active })); };
  let tree = render(true);
  assert.deepEqual(configs.map(config => config.enabled), [true, true]);
  const list = nodes(tree).find(node => node.type === 'List')!;
  assert.ok(list.props.ListHeaderComponent, '분류 필터는 목록과 함께 스크롤되는 헤더다');
  assert.equal(list.props.stickyHeaderIndices, undefined);
  assert.equal(list.props.ListHeaderComponent.props.style.position, undefined);
  assert.ok(configs.every(config => config.queryKey[1] === 'actor-a'));
  assert.equal(nodes(tree).some(node => node.type === 'Button' && node.props.children?.props?.children === '라이딩'), false);
  const filter = () => nodes(tree).find(node => node.type === 'FilterMenu')!;
  assert.equal(filter().props.value, 'all');
  assert.equal(nodes(tree).find(node => node.type === 'Empty')?.props.title, '아직 제보한 내역이 없습니다');
  assert.equal(list.props.ListHeaderComponent.props.children[0].props.style.justifyContent, 'flex-end');
  fixtures['my-submissions'] = [{ id: 'shared-id', createdAt: '2026-11-01T12:00:00Z' }];
  fixtures['my-feedback'] = [{ id: 'shared-id', createdAt: '2026-11-02T12:00:00Z' }];
  tree = render(true);
  const combined = nodes(tree).find(node => node.type === 'List')!;
  assert.deepEqual(Array.from(combined.props.data, (row: any) => row.kind), ['feedback', 'place']);
  assert.equal(new Set(combined.props.data.map(combined.props.keyExtractor)).size, 2);
  hidden = [{ kind: 'place_submission', target_id: 'shared-id' }];
  tree = render(true);
  assert.deepEqual(Array.from(nodes(tree).find(node => node.type === 'List')!.props.data, (row: any) => row.kind), ['feedback']);
  filter().props.onChange('places'); tree = render(true);
  assert.deepEqual(configs.map(config => config.enabled), [true, false]);
  fixtures['my-feedback'] = [];
  filter().props.onChange('feedback'); tree = render(true);
  assert.deepEqual(configs.map(config => config.enabled), [false, true]);
  assert.equal(nodes(tree).find(node => node.type === 'Empty')?.props.title, '보낸 건의가 없습니다');
  render(false); assert.ok(configs.every(config => !config.enabled));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as categories from '../constants/categories';
import { loadModule } from './helpers/loadModule';

type Node = { type: unknown; props?: Record<string, any> };

const privateKeys = ['name', 'address', 'latitude', 'longitude', 'lat', 'lng', 'email', 'photo', 'photos', 'query', 'user_id', 'userId'];
const colors = {
  text: '#111', textSecondary: '#888', background: '#fff', surface: '#fff',
  surfaceMuted: '#eee', tint: '#000', border: '#ddd',
};

function createReact() {
  const states = new Map<Function, { values: any[]; effects: { deps: unknown[]; cleanup?: () => void }[]; stateIndex: number; effectIndex: number }>();
  let current: { values: any[]; effects: any[]; stateIndex: number; effectIndex: number } | null = null;
  const scheduled: (() => void)[] = [];
  const rendered = new Set<Function>();
  let dirty = false;

  function useState(initial: any) {
    const record = current;
    if (!record) throw new Error('훅이 컴포넌트 밖에서 호출됨');
    const index = record.stateIndex++;
    if (!(index in record.values)) record.values[index] = typeof initial === 'function' ? initial() : initial;
    return [record.values[index], (next: any) => {
      const value = typeof next === 'function' ? next(record.values[index]) : next;
      if (!Object.is(value, record.values[index])) {
        record.values[index] = value;
        dirty = true;
      }
    }] as const;
  }

  const react = {
    useState,
    useRef(initial: any) { return useState(() => ({ current: initial }))[0]; },
    useEffect(run: () => void | (() => void), deps: unknown[]) {
      const record = current;
      if (!record) throw new Error('훅이 컴포넌트 밖에서 호출됨');
      const index = record.effectIndex++;
      const previous = record.effects[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      scheduled.push(() => {
        previous?.cleanup?.();
        const cleanup = run();
        record.effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
      });
    },
    useMemo(fn: () => unknown) { return fn(); },
    call(type: Function, props?: Record<string, unknown>) {
      rendered.add(type);
      let record = states.get(type);
      if (!record) {
        record = { values: [], effects: [], stateIndex: 0, effectIndex: 0 };
        states.set(type, record);
      }
      record.stateIndex = 0;
      record.effectIndex = 0;
      const prev = current;
      current = record;
      const node = type(props ?? {});
      current = prev;
      return node;
    },
  };

  function jsx(type: unknown, props: Record<string, any>) {
    if (typeof type === 'function') return react.call(type, props);
    return { type, props };
  }

  function render(screen: Function) {
    let tree: Node | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      dirty = false;
      rendered.clear();
      tree = react.call(screen, {}) as Node;
      for (const type of [...states.keys()]) if (!rendered.has(type)) states.delete(type);
      const batch = scheduled.splice(0);
      for (const run of batch) run();
      if (!dirty) return tree!;
    }
    throw new Error('제보 화면 상태 갱신이 끝나지 않음');
  }

  return { react, jsx, render };
}

function walk(node: unknown, visit: (node: Node) => void) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  const element = node as Node;
  if (!element.props) return;
  visit(element);
  walk(element.props.children, visit);
}

function textOf(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf((node as Node).props?.children);
}

function find(tree: Node, match: (node: Node) => boolean): Node | undefined {
  let found: Node | undefined;
  walk(tree, (node) => { if (!found && match(node)) found = node; });
  return found;
}

function wallOpen(tree: Node) {
  return Boolean(find(tree, (node) => node.props?.accessibilityLabel === '제보 계속하기'));
}

function pressByLabel(tree: Node, label: string) {
  const button = find(tree, (node) => node.props?.accessibilityLabel === label);
  assert.ok(button, `버튼을 찾지 못함: ${label}`);
  return button.props!.onPress();
}

function inputByPlaceholder(tree: Node, placeholder: string) {
  const input = find(tree, (node) => node.props?.placeholder === placeholder);
  assert.ok(input, `입력을 찾지 못함: ${placeholder}`);
  return input;
}

function pressText(tree: Node, label: string) {
  const button = find(tree, (node) => typeof node.props?.onPress === 'function' && textOf(node).includes(label));
  assert.ok(button, `문구 버튼을 찾지 못함: ${label}`);
  button.props!.onPress();
}

function same(actual: unknown, expected: unknown) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function assertNoPrivateProperties(properties: Record<string, unknown>) {
  for (const key of Object.keys(properties)) {
    assert.equal(privateKeys.includes(key), false, key);
  }
}

function host(name: string) {
  return { __esModule: true, default: name };
}

type Auth = { user: { id: string } | null; status: string };
type Sinks = {
  events: { method: string; properties: Record<string, unknown> }[];
  submitted: any[];
  uploads: { uri: string; folder: string }[];
  toasts: string[];
  navigations: unknown[];
  back: null | (() => boolean);
};

function screenDeps(react: ReturnType<typeof createReact>, auth: Auth, params: Record<string, string>, sinks: Sinks, extra: Record<string, unknown> = {}) {
  const toast = {
    info: (message: string) => sinks.toasts.push(message),
    success: (message: string) => sinks.toasts.push(message),
    error: (message: string) => sinks.toasts.push(message),
  };
  const gate = loadModule<{ holdSubmitForLogin: Function }>('lib/submitLoginGate.ts', {
    '@/lib/toast': { toast },
  });
  const track = new Proxy({}, {
    get: (_target, method) => (properties: Record<string, unknown>) => {
      sinks.events.push({ method: String(method), properties });
      assertNoPrivateProperties(properties);
    },
  });
  function LoginPrompt(props: { cancelLabel?: string; onCancel?: () => void }) {
    return {
      type: 'LoginPrompt',
      props: {
        ...props,
        children: { type: 'Pressable', props: { accessibilityLabel: props.cancelLabel, onPress: props.onCancel } },
      },
    };
  }
  return {
    react: react.react,
    'react/jsx-runtime': { jsx: react.jsx, jsxs: react.jsx },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss() {} }, KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' }, Pressable: 'Pressable', ScrollView: 'ScrollView',
      StyleSheet: {
        create: (value: unknown) => value,
        absoluteFill: { position: 'absolute' },
        absoluteFillObject: { position: 'absolute' },
        hairlineWidth: 1,
      },
      BackHandler: {
        addEventListener: (_name: string, handler: () => boolean) => {
          sinks.back = handler;
          return { remove() { if (sinks.back === handler) sinks.back = null; } };
        },
      },
      View: 'View',
    },
    '@/components/ui/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '@/hooks/useRevealKeyboardInput': { useRevealKeyboardInput: () => ({ onFocus() {} }) },
    '@/lib/nativeUI': { nativeUI: null },
    '@/components/ui/NativeChoiceControl': host('NativeChoiceControl'),
    '@/components/ui/CategoryIcon': host('CategoryIcon'),
    'expo-router': {
      useLocalSearchParams: () => params,
      router: { navigate: (value: unknown) => sinks.navigations.push(value), push() {} },
    },
    'expo-crypto': { digestStringAsync: async () => 'hash', CryptoDigestAlgorithm: { SHA256: 'SHA256' } },
    '@/lib/uploadImage': {
      pickImages: async () => ['file:///rider.jpg'],
      uploadImage: async (uri: string, folder: string) => {
        sinks.uploads.push({ uri, folder });
        return `https://cdn.example/${folder}`;
      },
      removeUploadedImage: async () => {},
    },
    '@/components/review/PhotoDragList': host('PhotoDragList'),
    '@/components/ui/ImageViewer': host('ImageViewer'),
    '@expo/vector-icons/Ionicons': host('Ionicons'),
    '@/constants/Colors': { __esModule: true, default: { light: colors, dark: colors } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/stores/useAuthStore': { useAuthStore: (select: (state: Auth) => unknown) => select(auth) },
    '@/lib/submitLoginGate': gate,
    '@/constants/categories': categories,
    '@/lib/api/places': {
      submitPlace: async (body: unknown) => { sinks.submitted.push(body); },
      checkPlaceDuplicate: async () => null,
    },
    '@/lib/api/generalPlaces': { generalPlaceIdentity: () => ({ provider: 'kakao', placeId: 'kakao-1' }) },
    '@/lib/push': { registerPushToken: async () => {} },
    '@/lib/toast': { toast },
    '@/lib/analytics': { track },
    '@/components/auth/LoginPrompt': { __esModule: true, default: LoginPrompt },
    '@/components/submit/SubmitFeedback': host('SubmitFeedback'),
    '@/components/submit/SubmitHazard': host('SubmitHazard'),
    '@/components/submit/AddressSearchModal': host('AddressSearchModal'),
    '@/components/navigation/NativeTabScreen': { withNativeTabScreen: (screen: unknown) => screen },
    '@/components/navigation/tabOcclusion': { TabScrollSpacer: 'TabScrollSpacer' },
    '@/components/navigation/headerInset': {
      HeaderInsetContext: { Provider: ({ children }: { children: unknown }) => children },
      useContentHeaderInset: () => 0,
    },
    '@/components/ui/HeaderBackdrop': host('HeaderBackdrop'),
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    ...extra,
  };
}

function mountScreen(params: Record<string, string>, auth: Auth) {
  const react = createReact();
  const sinks: Sinks = { events: [], submitted: [], uploads: [], toasts: [], navigations: [], back: null };
  const loaded = loadModule<{ default: Function }>('app/(tabs)/submit.tsx', screenDeps(react, auth, params, sinks));
  let tree = react.render(loaded.default);
  return {
    sinks,
    auth,
    render() { tree = react.render(loaded.default); return tree; },
    get tree() { return tree; },
  };
}

const searchPrefill = {
  prefillName: '한강 카페',
  prefillAddress: '서울시 영등포구 당산로',
  prefillLat: '37.52',
  prefillLng: '126.93',
  prefillProvider: 'kakao',
  prefillProviderId: 'kakao-1',
  prefillTs: '11',
};

async function fillPlace(screen: ReturnType<typeof mountScreen>, name = '라이더 카페') {
  inputByPlaceholder(screen.tree, '장소를 검색하면 자동 입력됩니다').props!.onChangeText(name);
  screen.render();
  pressText(screen.tree, '카페');
  screen.render();
  const photos = find(screen.tree, (node) => node.type === 'PhotoDragList');
  assert.ok(photos);
  photos.props!.onAdd();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  screen.render();
}

test('비로그인 제보를 입력한 뒤 로그인하거나 취소해도 같은 폼으로 돌아온다', async () => {
  for (const source of ['tab', 'arrival', 'temp_place', 'search_empty'] as const) {
    const auth: Auth = { user: null, status: 'signed_out' };
    const params = source === 'tab' ? {} : { ...searchPrefill, prefillSource: source };
    const screen = mountScreen(params, auth);
    assert.equal(wallOpen(screen.tree), false);
    assert.equal(screen.sinks.events.some((event) => event.properties.result === 'login'), false);
    if (source === 'temp_place') {
      assert.ok(find(screen.tree, (node) => node.props?.accessibilityLabel === '장소 상세로 돌아가기'));
    }
    if (source === 'tab') {
      find(screen.tree, (node) => node.type === 'AddressSearchModal')!.props!.onSelect({
        placeName: '탭에서 고른 곳', roadAddress: '부산시 해운대구', address: '부산시 해운대구',
        latitude: 35.16, longitude: 129.16, providerId: 'kakao-1',
      });
      screen.render();
    }
    await fillPlace(screen, source === 'tab' ? '탭에서 고른 곳' : '직접 고친 이름');
    const photos = find(screen.tree, (node) => node.type === 'PhotoDragList')!;
    same(photos.props!.uris, ['file:///rider.jpg']);

    await pressByLabel(screen.tree, '장소 제보하기');
    screen.render();
    assert.equal(wallOpen(screen.tree), true);
    assert.equal(inputByPlaceholder(screen.tree, '장소를 검색하면 자동 입력됩니다').props!.value, source === 'tab' ? '탭에서 고른 곳' : '직접 고친 이름');
    same(find(screen.tree, (node) => node.type === 'PhotoDragList')!.props!.uris, ['file:///rider.jpg']);
    assert.equal(screen.sinks.events.at(-1)?.method, 'placeSubmissionAttempted');
    same(screen.sinks.events.at(-1)?.properties, { source, result: 'login' });

    if (source === 'tab') assert.equal(screen.sinks.back?.(), true);
    else pressByLabel(screen.tree, '제보 계속하기');
    screen.render();
    assert.equal(wallOpen(screen.tree), false);
    assert.equal(inputByPlaceholder(screen.tree, '장소를 검색하면 자동 입력됩니다').props!.value, source === 'tab' ? '탭에서 고른 곳' : '직접 고친 이름');
    same(find(screen.tree, (node) => node.type === 'PhotoDragList')!.props!.uris, ['file:///rider.jpg']);
    same(screen.sinks.events.at(-1)?.properties, { source });
    assert.equal(screen.sinks.events.at(-1)?.method, 'placeSubmissionLoginCancelled');

    await pressByLabel(screen.tree, '장소 제보하기');
    screen.render();
    auth.user = { id: 'user-1' };
    auth.status = 'signed_in';
    screen.render();
    assert.equal(wallOpen(screen.tree), false);
    assert.equal(inputByPlaceholder(screen.tree, '장소를 검색하면 자동 입력됩니다').props!.value, source === 'tab' ? '탭에서 고른 곳' : '직접 고친 이름');
    assert.equal(screen.sinks.events.at(-1)?.method, 'placeSubmissionLoginCompleted');
    same(screen.sinks.events.at(-1)?.properties, { source });

    await pressByLabel(screen.tree, '장소 제보하기');
    for (let i = 0; i < 8; i++) await Promise.resolve();
    screen.render();
    assert.equal(screen.sinks.submitted.length, 1);
    assert.equal(screen.sinks.submitted[0].name, source === 'tab' ? '탭에서 고른 곳' : '직접 고친 이름');
    assert.equal(screen.sinks.submitted[0].category, 'cafe');
    same(screen.sinks.submitted[0].photos, ['https://cdn.example/place-submissions/hash']);
    if (source === 'tab') {
      assert.equal(screen.sinks.submitted[0].latitude, 35.16);
      assert.equal(screen.sinks.submitted[0].longitude, 129.16);
    } else {
      assert.equal(screen.sinks.submitted[0].latitude, 37.52);
      assert.equal(screen.sinks.submitted[0].longitude, 126.93);
    }
    assert.equal(screen.sinks.uploads[0].uri, 'file:///rider.jpg');
    assert.equal(inputByPlaceholder(screen.tree, '장소를 검색하면 자동 입력됩니다').props!.value, '');
    same(find(screen.tree, (node) => node.type === 'PhotoDragList')!.props!.uris, []);
  }
});

test('필수 항목이 비거나 세션을 복원 중이면 로그인 벽을 열지 않는다', async () => {
  const signedOut = mountScreen({ ...searchPrefill, prefillSource: 'arrival' }, { user: null, status: 'signed_out' });
  await pressByLabel(signedOut.tree, '장소 제보하기');
  signedOut.render();
  assert.equal(wallOpen(signedOut.tree), false);
  same(signedOut.sinks.events.at(-1)?.properties, { source: 'arrival', result: 'missing_category' });

  const restoring = mountScreen({ ...searchPrefill, prefillSource: 'search_empty' }, { user: null, status: 'restoring' });
  pressText(restoring.tree, '카페');
  restoring.render();
  await pressByLabel(restoring.tree, '장소 제보하기');
  restoring.render();
  assert.equal(wallOpen(restoring.tree), false);
  assert.equal(restoring.sinks.events.some((event) => event.properties.result === 'login'), false);
  assert.equal(restoring.sinks.toasts.at(-1), '로그인 상태를 확인하고 있어요.');
});

test('위험·건의 입력도 로그인 벽 아래에서 유지되고 위험 사진은 로그인 뒤에 올라간다', async () => {
  const auth: Auth = { user: null, status: 'signed_out' };
  const react = createReact();
  const hazardSinks = { submitted: [] as any[], uploads: [] as { uri: string; folder: string }[] };
  const hazard = loadModule<{ default: Function }>('components/submit/SubmitHazard.tsx', {
    react: react.react,
    'react/jsx-runtime': { jsx: react.jsx, jsxs: react.jsx },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss() {} }, Pressable: 'Pressable',
      ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value }, View: 'View',
    },
    '@/components/ui/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '@expo/vector-icons/MaterialCommunityIcons': host('MaterialCommunityIcons'),
    '@expo/vector-icons/Ionicons': host('Ionicons'),
    '@/components/ui/CloseIcon': host('CloseIcon'),
    'expo-image': { Image: 'Image' },
    '@/hooks/useRevealKeyboardInput': { useRevealKeyboardInput: () => ({ onFocus() {} }) },
    '@/constants/Colors': { __esModule: true, default: { light: colors } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/constants/hazards': await import('../constants/hazards'),
    '@/hooks/useHazards': { useSubmitHazard: () => ({ mutateAsync: async (body: unknown) => { hazardSinks.submitted.push(body); }, isPending: false }) },
    '@/stores/useMapStore': { useMapStore: (select: Function) => select({ userLocation: { latitude: 37.5, longitude: 127.0 } }) },
    '@/lib/api/kakaoLocal': { coordToAddress: async () => '서울시 마포구' },
    '@/components/submit/AddressSearchModal': host('AddressSearchModal'),
    '@/components/map/MapPickerModal': host('MapPickerModal'),
    '@/lib/uploadImage': {
      pickImage: async () => 'file:///hazard.jpg',
      uploadImage: async (uri: string, folder: string) => {
        hazardSinks.uploads.push({ uri, folder });
        return `https://cdn.example/${folder}`;
      },
    },
    '@/stores/useAuthStore': { useAuthStore: (select: (state: Auth) => unknown) => select(auth) },
    '@/lib/submitLoginGate': loadModule('lib/submitLoginGate.ts', {
      '@/lib/toast': { toast: { info() {}, success() {}, error() {} } },
    }),
    '@/lib/toast': { toast: { info() {}, success() {}, error() {} } },
    '@/components/navigation/tabOcclusion': { TabScrollSpacer: 'TabScrollSpacer' },
    '@/components/navigation/headerInset': { useContentHeaderInset: () => 0 },
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@/lib/push': { registerPushToken: async () => {} },
  });
  const feedbackSinks = { submitted: [] as unknown[] };
  const feedback = loadModule<{ default: Function }>('components/submit/SubmitFeedback.tsx', {
    react: react.react,
    'react/jsx-runtime': { jsx: react.jsx, jsxs: react.jsx },
    'react-native': {
      Keyboard: { dismiss() {} }, KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value }, View: 'View',
    },
    '@/components/ui/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '@/hooks/useRevealKeyboardInput': { useRevealKeyboardInput: () => ({ onFocus() {} }) },
    '@expo/vector-icons/Ionicons': host('Ionicons'),
    'react-native-reanimated': {
      __esModule: true,
      default: { createAnimatedComponent: (value: unknown) => value, View: 'AnimatedView' },
      useSharedValue: () => ({ value: 1 }),
      useAnimatedStyle: () => ({}),
      withSpring: (value: unknown) => value,
    },
    '@/constants/Colors': { __esModule: true, default: { light: colors, dark: colors } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/api/feedback': { submitFeedback: async (body: unknown) => { feedbackSinks.submitted.push(body); } },
    '@/lib/submitLoginGate': loadModule('lib/submitLoginGate.ts', {
      '@/lib/toast': { toast: { info() {}, success() {}, error() {} } },
    }),
    '@/stores/useAuthStore': { useAuthStore: (select: (state: Auth) => unknown) => select(auth) },
    '@/lib/toast': { toast: { info() {}, success() {}, error() {} } },
    '@/components/navigation/tabOcclusion': { TabScrollSpacer: 'TabScrollSpacer' },
    '@/components/navigation/headerInset': { useContentHeaderInset: () => 0 },
    '@/components/navigation/headerScroll': { useTrackHeaderScroll: () => () => {} },
    '@/lib/push': { registerPushToken: async () => {} },
  });
  const sinks: Sinks = { events: [], submitted: [], uploads: [], toasts: [], navigations: [], back: null };
  const loaded = loadModule<{ default: Function }>('app/(tabs)/submit.tsx', screenDeps(react, auth, { prefillSource: 'arrival' }, sinks, {
    '@/components/submit/SubmitHazard': hazard,
    '@/components/submit/SubmitFeedback': feedback,
  }));
  let tree = react.render(loaded.default);
  pressText(tree, '위험');
  tree = react.render(loaded.default);
  pressText(tree, '모래·자갈');
  tree = react.render(loaded.default);
  find(tree, (node) => node.type === 'AddressSearchModal')!.props!.onSelect({
    roadAddress: '인천시 중구', address: '인천시 중구', latitude: 37.4, longitude: 126.6,
  });
  tree = react.render(loaded.default);
  inputByPlaceholder(tree, '어떤 상황인지 알려주세요 (선택)').props!.onChangeText('우측 차선');
  tree = react.render(loaded.default);
  pressText(tree, '사진 추가');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  tree = react.render(loaded.default);
  assert.equal(hazardSinks.uploads.length, 0);
  pressText(tree, '위험 제보하기');
  tree = react.render(loaded.default);
  assert.equal(wallOpen(tree), true);
  assert.equal(inputByPlaceholder(tree, '어떤 상황인지 알려주세요 (선택)').props!.value, '우측 차선');
  assert.equal(textOf(tree).includes('인천시 중구'), true);
  assert.equal(sinks.events.some((event) => event.method.startsWith('placeSubmission')), false);
  pressByLabel(tree, '제보 계속하기');
  tree = react.render(loaded.default);
  assert.equal(wallOpen(tree), false);
  assert.equal(inputByPlaceholder(tree, '어떤 상황인지 알려주세요 (선택)').props!.value, '우측 차선');

  pressText(tree, '위험 제보하기');
  tree = react.render(loaded.default);
  auth.user = { id: 'user-1' };
  auth.status = 'signed_in';
  tree = react.render(loaded.default);
  assert.equal(wallOpen(tree), false);
  assert.equal(sinks.events.length, 0);
  pressText(tree, '위험 제보하기');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  tree = react.render(loaded.default);
  same(hazardSinks.uploads, [{ uri: 'file:///hazard.jpg', folder: 'hazards/user-1' }]);
  assert.equal(hazardSinks.submitted[0].latitude, 37.4);
  assert.equal(hazardSinks.submitted[0].longitude, 126.6);
  assert.equal(hazardSinks.submitted[0].note, '우측 차선');
  assert.equal(hazardSinks.submitted[0].photo, 'https://cdn.example/hazards/user-1');

  pressText(tree, '건의');
  tree = react.render(loaded.default);
  auth.user = null;
  auth.status = 'signed_out';
  tree = react.render(loaded.default);
  pressText(tree, '버그 신고');
  tree = react.render(loaded.default);
  inputByPlaceholder(tree, '불편사항이나 건의사항을 자유롭게 작성해주세요').props!.onChangeText('지도가 멈춤');
  tree = react.render(loaded.default);
  pressText(tree, '의견 보내기');
  tree = react.render(loaded.default);
  assert.equal(wallOpen(tree), true);
  assert.equal(inputByPlaceholder(tree, '불편사항이나 건의사항을 자유롭게 작성해주세요').props!.value, '지도가 멈춤');
  pressByLabel(tree, '제보 계속하기');
  tree = react.render(loaded.default);
  assert.equal(inputByPlaceholder(tree, '불편사항이나 건의사항을 자유롭게 작성해주세요').props!.value, '지도가 멈춤');
  assert.equal(feedbackSinks.submitted.length, 0);
  assert.equal(sinks.events.length, 0);
});

test('제보 로그인 벽의 취소와 소셜 로그인 취소는 같은 복귀로 이어진다', () => {
  const cancels: string[] = [];
  const react = createReact();
  let socialCancel: (() => void) | undefined;
  const prompt = loadModule<{ default: Function }>('components/auth/LoginPrompt.tsx', {
    react: react.react,
    'react/jsx-runtime': { jsx: react.jsx, jsxs: react.jsx },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss() {} }, KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'ios' }, Pressable: 'Pressable', ScrollView: 'ScrollView',
      StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }, View: 'View',
    },
    '@/components/ui/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '@/hooks/useRevealKeyboardInput': { useRevealKeyboardInput: () => ({ onFocus() {} }) },
    '@expo/vector-icons/Ionicons': host('Ionicons'),
    'expo-image': { Image: 'Image' },
    'react-native-gesture-handler': { TouchableOpacity: 'TouchableOpacity' },
    'react-native-reanimated': {
      __esModule: true,
      default: { createAnimatedComponent: (value: unknown) => value, View: 'AnimatedView' },
      FadeInDown: { duration: () => ({}) },
    },
    'expo-router': { router: { push() {} } },
    '@/constants/Colors': { __esModule: true, default: { light: colors }, semantic: { success: 'green', danger: 'red' } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/auth': { signInWithEmail: async () => {}, signUpWithEmail: async () => {} },
    '@/lib/nickname': {
      generateRandomNickname: () => '라이더', checkNicknameAvailable: async () => true,
      completeOnboarding: async () => {}, updateAvatarUrl: async () => {},
    },
    '@/lib/uploadImage': { pickImage: async () => null, uploadImage: async () => '' },
    '@/lib/toast': { toast: { info() {}, success() {}, error() {} } },
    '@/stores/useAuthStore': {
      useAuthStore: (select: Function) => select({
        status: 'signed_out', restoreError: null, refreshOnboardingStatus() {}, session: null, signOut() {},
      }),
    },
    '@/components/auth/SocialLoginButtons': {
      __esModule: true,
      default: (props: { onCancelled?: () => void }) => {
        socialCancel = props.onCancelled;
        return { type: 'SocialLoginButtons', props };
      },
      RecentLoginBadge: () => null,
    },
    '@/lib/recentLogin': { clearRecentLoginProvider: async () => {}, getRecentLoginProvider: async () => null },
    '@/lib/api/account': { discardIncompleteOnboardingAccount: async () => {} },
    '@/lib/pendingAccountLink': {
      setPendingAccountLink() {}, SOCIAL_PROVIDER_LABELS: {}, socialProviderFromIdentity: () => null,
    },
    '@/lib/dialog': { appAlert() {} },
  });
  const tree = react.render(() => prompt.default({
    message: '제보하려면 로그인이 필요합니다.',
    cancelLabel: '제보 계속하기',
    onCancel: () => cancels.push('cancel'),
  }));
  pressByLabel(tree, '제보 계속하기');
  assert.equal(typeof socialCancel, 'function');
  socialCancel!();
  same(cancels, ['cancel', 'cancel']);
});

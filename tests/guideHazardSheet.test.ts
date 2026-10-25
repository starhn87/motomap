import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup(custom = true, pendingGPS = false) {
  let expireGPS: (() => void) | undefined;
  let resolveGPS: (value: any) => void = () => {};
  const callbacks: Record<string, (payload: any) => void> = {};
  const order: string[] = [], reports: any[] = [], notices: string[] = [];
  let choose!: (index: number) => void, opens = 0;
  let allowed = true, revision = 1, position = { latitude: 37, longitude: 127 };
  const session = { goal: { name: '목적지' } as { name: string } | null };
  const picker = () => { opens++; order.push(custom ? 'custom' : 'legacy'); return new Promise<number>(resolve => { choose = resolve; }); };
  const module = loadModule<{ registerGuideEvents(): () => void }>('lib/guideEvents.ts', {
    '@/stores/useLocationPrivacyStore': {
      withLocationUse: async (_p: any, _v: any, work: any) => work(), locationUseAllowed: () => allowed,
      useLocationPrivacyStore: { getState: () => ({ revision }) },
    },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, removeItem: async () => {} } },
    'expo-router': { router: {} },
    '@/modules/kakao-navi': { __esModule: true, default: {
      addListener: (event: string, fn: any) => { callbacks[event] = fn; return { remove() {} }; },
      showGuideHazardOptions: picker, showGuideOptions: picker,
      showGuideToast: async (message: string) => { notices.push(message); }, showGuideNotice: async (message: string) => { notices.push(message); },
    }, HAZARD_BUTTON_ID: 101, MOTOMAP_MENU_ID: 100, supportsKakaoNaviFeature: () => custom, friendlyRouteError: String },
    'expo-location': { Accuracy: { Balanced: 1 }, getCurrentPositionAsync: async () => { order.push('gps'); return pendingGPS ? new Promise(resolve => { resolveGPS = resolve; }) : { coords: { ...position } }; } },
    '@/constants/hazards': { HAZARD_LIST: [{ key: 'sand', label: '모래·자갈' }, { key: 'ice', label: '결빙' }] },
    '@/lib/api/hazards': { submitHazard: async (report: any) => { reports.push(report); } },
    '@/lib/guideSession': { useGuideSession: { getState: () => session } },
    '@/lib/dialog': {}, '@/lib/api/places': {}, '@/lib/api/directions': {}, '@/lib/distance': {}, '@/lib/mapFocus': {}, '@/lib/api/rides': {},
    '@/lib/toast': { toast: {} }, '@/lib/analytics': { track: {} }, '@/lib/api/courseLibrary': {}, '@/lib/api/kakaoLocal': {}, '@/stores/useMyPlacesStore': {}, '@/lib/ridePlaceStats': {},
  }, { setTimeout: (fn: () => void) => { expireGPS = fn; return 1; }, clearTimeout: () => {} });
  module.registerGuideEvents();
  return { session, reports, order, notices, expireGPS: () => expireGPS?.(), resolveGPS: () => resolveGPS({ coords: { ...position } }), tap: () => callbacks.onGuideMenu({ id: 101 }), choose: (index: number) => choose(index),
    get opens() { return opens; }, move: () => { position = { latitude: 38, longitude: 128 }; },
    revoke: () => { allowed = false; revision++; }, changeRevision: () => { revision++; },
    flush: async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); },
  };
}

test('전용 위험 시트는 연타를 막고 유형 선택 전 탭 순간 좌표로 한 번 제보한다', async () => {
  const f = setup(); f.tap(); f.tap(); await f.flush();
  assert.deepEqual(f.order, ['gps', 'custom']); assert.equal(f.opens, 1);
  f.move(); f.choose(1); await f.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(f.reports)), [{ type: 'ice', latitude: 37, longitude: 127 }]);
  assert.match(f.notices[0], /제보했어요/);
});
for (const index of [-1, 9, 0.5]) {
  test(`위험 시트 취소/잘못된 선택 ${index}는 저장하지 않고 다시 열 수 있다`, async () => {
    const f = setup(); f.tap(); f.choose(index); await f.flush();
    assert.equal(f.reports.length, 0); f.tap(); assert.equal(f.opens, 2); f.choose(-1); await f.flush();
  });
}
for (const state of ['revoke', 'revision', 'ended'] as const) {
  test(`시트 대기 중 ${state}면 늦은 선택을 제보하지 않는다`, async () => {
    const f = setup(); f.tap();
    if (state === 'revoke') f.revoke(); else if (state === 'revision') f.changeRevision(); else f.session.goal = null;
    f.choose(0); await f.flush(); assert.equal(f.reports.length, 0);
  });
}
test('전용 시트 기능이 없는 바이너리는 기존 picker를 사용한다', async () => {
  const f = setup(false); f.tap(); f.choose(0); await f.flush();
  assert.deepEqual(f.order, ['gps', 'legacy']); assert.equal(f.reports.length, 1);
});


test('GPS 대기가 만료되면 저장 없이 잠금을 풀고 늦은 위치는 무시한다', async () => {
  const f = setup(true, true); f.tap(); f.choose(0); await f.flush();
  f.expireGPS(); await f.flush();
  assert.equal(f.reports.length, 0); assert.match(f.notices[0], /현재 위치/);
  f.resolveGPS(); await f.flush(); assert.equal(f.reports.length, 0);
  f.tap(); assert.equal(f.opens, 2); f.choose(-1); await f.flush();
});

test('이전 안내의 GPS가 대기 중이어도 새 안내의 제보를 막지 않는다', async () => {
  const f = setup(true, true); f.tap(); f.choose(0); await f.flush();
  f.session.goal = { name: '새 목적지' }; f.tap(); assert.equal(f.opens, 2);
  f.choose(-1); f.expireGPS(); await f.flush(); assert.equal(f.reports.length, 0);
});

test('인증 대기 중 유효성이 바뀌면 insert 직전 중단한다', async () => {
  let authenticated!: (user: { id: string }) => void;
  let active = true, inserts = 0;
  const api = loadModule<{ submitHazard(params: any, guard?: () => boolean): Promise<void> }>('lib/api/hazards.ts', {
    '@/lib/auth': { requireUser: () => new Promise(resolve => { authenticated = resolve; }) },
    '@/stores/useLocationPrivacyStore': {},
    '@/lib/supabase': { supabase: { from: () => ({ insert: async () => { inserts++; return { error: null }; } }) } },
  });
  const pending = api.submitHazard({ type: 'ice', latitude: 37, longitude: 127, canSubmit: () => active });
  active = false; authenticated({ id: 'rider' }); await pending;
  assert.equal(inserts, 0);
  const next = api.submitHazard({ type: 'ice', latitude: 37, longitude: 127 });
  authenticated({ id: 'rider' }); await next; assert.equal(inserts, 1);
});

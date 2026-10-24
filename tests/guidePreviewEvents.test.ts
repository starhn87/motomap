import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup(failOpen = false) {
  const callbacks: Record<string, (payload: any) => void> = {};
  const snapshot = { token: 9, goal: { name: '목적지' }, vias: [], passedVias: [] };
  let finishAudit!: () => void, clearCount = 0;
  const pushed: any[] = [], notices: string[] = [];
  const store: any = { goal: snapshot.goal, preview: null, setPreview(value: any) { store.preview = value; }, clear() { clearCount++; store.goal = null; } };
  const module = loadModule<{ registerGuideEvents(): () => void }>('lib/guideEvents.ts', {
    '@/stores/useLocationPrivacyStore': { withLocationUse: async (_purpose: any, _provider: any, work: any) => { await work(); await new Promise<void>((resolve) => { finishAudit = resolve; }); } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, removeItem: async () => {} } },
    'expo-router': { router: { push: (value: any) => pushed.push(value) } },
    '@/modules/kakao-navi': { __esModule: true, default: { addListener: (event: string, fn: any) => { callbacks[event] = fn; return { remove() {} }; }, openGuidePreview: async () => { if (failOpen) throw Error('GPS unavailable'); return snapshot; }, showGuideNotice: async (message: string) => { notices.push(message); } },
      HAZARD_BUTTON_ID: 101, MOTOMAP_MENU_ID: 100, supportsKakaoNaviFeature: () => true, friendlyRouteError: String },
    '@/lib/guideSession': { useGuideSession: { getState: () => store } },
    '@/lib/dialog': {}, 'expo-location': {}, '@/constants/hazards': {}, '@/lib/api/hazards': {}, '@/lib/api/places': {}, '@/lib/api/directions': {}, '@/lib/distance': {}, '@/lib/mapFocus': {}, '@/lib/api/rides': {},
    '@/lib/toast': { toast: { error() {} } }, '@/lib/analytics': { track: {} }, '@/lib/api/courseLibrary': {}, '@/lib/api/kakaoLocal': {}, '@/stores/useMyPlacesStore': {}, '@/lib/ridePlaceStats': {},
  });
  module.registerGuideEvents();
  return { callbacks, store, pushed, notices, get clears() { return clearCount; }, finishAudit: () => finishAudit?.(), flush: async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); } };
}

test('하단 메뉴에서 native를 내린 직후 감사 RPC 후처리 전에 미리보기를 연다', async () => {
  const f = setup(); f.callbacks.onGuideMenu({ id: 103 }); await f.flush();
  assert.equal(f.store.preview.snapshot.token, 9);
  assert.equal(f.pushed.length, 1);
  assert.equal(f.pushed[0].pathname, '/navi');
  assert.equal(f.pushed[0].params.resume, '9');
  f.finishAudit(); await f.flush();
});

test('기존 안내 중 새 일반 안내가 거절돼도 기존 세션과 라이딩 마커를 보존한다', () => {
  const f = setup(); f.callbacks.onGuideFailed({ code: 'ACTIVE_GUIDE', message: '기존 안내가 있어요', preserveActive: true });
  assert.equal(f.clears, 0);
  assert.equal(f.store.goal.name, '목적지');
});


for (const [id, edit] of [[104, 'goal'], [105, 'vias']] as const) {
  test(`메뉴 ${id}는 기존 안내를 보존하고 ${edit} 편집 모드로 진입한다`, async () => {
    const f = setup(); f.callbacks.onGuideMenu({ id }); await f.flush();
    assert.equal(f.pushed.length, 1); assert.equal(f.store.preview.edit, edit);
    assert.equal(f.clears, 0); f.finishAudit();
  });
}
test('편집 진입 오류는 native 안내 위 알림으로 보여 무반응으로 보이지 않게 한다', async () => {
  const f = setup(true); f.callbacks.onGuideMenu({ id: 103 }); await f.flush();
  assert.equal(f.pushed.length, 0);
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0], /GPS unavailable/);
});

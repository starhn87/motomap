import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import * as guidePreview from '@/lib/guidePreview';

function setup(failOpen = false, enabled = true, routeEditing = enabled, capability = true, poiChoice = 0) {
  const callbacks: Record<string, (payload: any) => void> = {};
  const snapshot = { token: 9, goal: { name: '목적지', latitude:37.5, longitude:127 }, vias: [], passedVias: [] };
  let finishAudit!: () => void, clearCount = 0;
  const pushed: any[] = [], notices: string[] = [];
  const store: any = { goal: snapshot.goal, preview: null, setPreview(value: any) { store.preview = value; }, clear() { clearCount++; store.goal = null; } };
  const module = loadModule<{ registerGuideEvents(): () => void }>('lib/guideEvents.ts', {
    '@/lib/guidePreview': guidePreview,
    '@/lib/guideGasPriceEvents': { handleGuideGasPrices: async () => {}, cancelGuideGasPrices() {} },
    '@/lib/guideMenuPolicy': { GUIDE_MENU_ACTIONS_ENABLED: enabled, GUIDE_ROUTE_EDITING_ENABLED: routeEditing, GUIDE_MENU_UNAVAILABLE_MESSAGE: '이번 버전에서는 안내 음량과 종료만 지원해요.' },
    '@/stores/useLocationPrivacyStore': { locationUseAllowed: () => true, useLocationPrivacyStore:{ getState:() => ({revision:1}) }, withLocationUse: async (_purpose: any, _provider: any, work: any) => { await work(); await new Promise<void>((resolve) => { finishAudit = resolve; }); } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, removeItem: async () => {} } },
    'expo-router': { router: { push: (value: any) => pushed.push(value) } },
    '@/modules/kakao-navi': { __esModule: true, default: { addListener: (event: string, fn: any) => { callbacks[event] = fn; return { remove() {} }; }, showGuidePoiOptions: async () => poiChoice, returnToGuide: async () => true, openGuidePreview: async () => { if (failOpen) throw Error('GPS unavailable'); return snapshot; }, showGuideToast: async (message: string) => { notices.push(message); }, showGuideNotice: async (message: string) => { notices.push(message); } },
      HAZARD_BUTTON_ID: 101, MOTOMAP_MENU_ID: 100, supportsKakaoNaviFeature: () => capability, friendlyRouteError: String },
    '@/lib/guideSession': { useGuideSession: { getState: () => store } },
    '@/lib/guideArrival': {},
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


for (const id of [104,105,107]) {
  test(`메뉴 ${id}는 기존 안내를 보존하고 통합 경로 편집 모드로 진입한다`, async () => {
    const f = setup(); f.callbacks.onGuideMenu({ id }); await f.flush();
    assert.equal(f.pushed.length, 1); assert.equal(f.store.preview.edit, null);
    assert.equal(f.clears, 0); f.finishAudit();
  });
}
test('편집 진입 오류는 native 안내 위 알림으로 보여 무반응으로 보이지 않게 한다', async () => {
  const f = setup(true); f.callbacks.onGuideMenu({ id: 103 }); await f.flush();
  assert.equal(f.pushed.length, 0);
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0], /GPS unavailable/);
});

for (const id of [100,101,103,104,105,106,108]) {
  test(`배포 정책은 구 메뉴 이벤트 ${id}의 기능 진입을 막는다`, async () => {
    const f=setup(false,false); f.callbacks.onGuideMenu({id}); await f.flush();
    assert.equal(f.pushed.length,0); assert.equal(f.store.preview,null); assert.equal(f.clears,0);
    assert.match(f.notices[0],/안내 음량과 종료/);
    assert.equal(f.callbacks.onGuidePoiTap,undefined);
  });
}

for (const id of [103,107]) {
  test(`경로 전용 정책은 ${id}만 새 네이티브 계약에서 열고 위험·주유소는 유지 차단한다`, async () => {
    const f=setup(false,false,true); f.callbacks.onGuideMenu({id}); await f.flush();
    assert.equal(f.pushed.length,1); assert.equal(f.store.preview.edit,null); f.finishAudit();
    for (const removed of [100,101,106,108]) f.callbacks.onGuideMenu({id:removed});
    await f.flush(); assert.equal(f.pushed.length,1); assert.equal(typeof f.callbacks.onGuidePoiTap,'function');
    const old=setup(false,false,true,false); old.callbacks.onGuideMenu({id}); await old.flush();
    assert.equal(old.pushed.length,0);
  });
}

for (const choice of [0,1,-1]) {
  test(`지도 POI 선택 ${choice}는 즉시 재안내하지 않고 목적지/경유지 미리보기로 전달한다`,async()=>{
    const f=setup(false,false,true,true,choice);const original=f.store.goal;
    const point={name:'선택 카페',latitude:37.51,longitude:127.01};
    f.callbacks.onGuidePoiTap(point);f.callbacks.onGuidePoiTap(point);await f.flush();
    assert.equal(f.store.goal,original);assert.equal(f.clears,0);
    assert.equal(f.pushed.length,choice<0?0:1);
    if(choice===0){assert.equal(f.store.preview.snapshot.goal.name,point.name);assert.equal(f.store.preview.snapshot.goalReplaced,true);}
    if(choice===1){assert.equal(f.store.preview.snapshot.vias[0].name,point.name);assert.equal(f.store.preview.snapshot.unregisteredViaAdded,true);}
    f.finishAudit();
  });
}

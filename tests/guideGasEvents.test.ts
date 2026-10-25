import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup() {
  let allowed = true, revision = 1, chosen: any = null, failure = false, failPush = false;
  let beforeWork: Promise<void> | null = null, releaseWork: (()=>void) | undefined; let opened = 0;
  let holdAudit = false; const audits: (()=>void)[] = [];
  let resolveFetch: ((stations: any[]) => void) | undefined;
  const goal = { name: '원래 목적지', latitude: 37, longitude: 127 };
  const session = { goal: goal as any, preview: null as any, setPreview(preview: any) { this.preview = preview; } };
  const updates: any[] = [], returns: number[] = [], pushed: any[] = [], toasts: string[] = [], requests: any[] = [];
  let snapshot = { token: 7, start: null, goal, vias: [] as any[], passedVias: [], priority: 0 };
  const context = { requestId: 'one', latitude: 37, longitude: 127, prod: 'B034', viaCount: 0 };
  const mod = loadModule<{ handleGuideGasMenu(id: number): Promise<void> }>('lib/guideGasEvents.ts', {
    'expo-router': { router: { push: (value: any) => { if (failPush) throw new Error('push'); pushed.push(value); } } },
    '@/modules/kakao-navi': { __esModule: true, supportsKakaoNaviFeature: () => false, default: {
      getGuideGasContext: async () => context, takeGuideGasSelection: async () => { const value = chosen; chosen = null; return value; },
      updateGuideGasStations: async (json: string) => { updates.push(JSON.parse(json)); },
      openGuidePreview: async () => { opened++; return snapshot; }, returnToGuide: async (token: number) => { returns.push(token); return true; },
      showGuideToast: async (message: string) => { toasts.push(message); },
    } },
    '@/lib/guideGasSearch': {},
    '@/lib/api/gasStations': { fetchNearbyGasStations: async (params: any) => { requests.push(params); if (failure) throw new Error('offline'); return new Promise(resolve => { resolveFetch = resolve; }); } },
    '@/lib/distance': { haversine: (_a: any, b: any) => b.distance ?? 0 },
    '@/lib/guideSession': { useGuideSession: { getState: () => session } },
    '@/stores/useLocationPrivacyStore': { providerLocationAllowed: () => allowed,
      useLocationPrivacyStore: { getState: () => ({ revision }) }, withLocationUse: async (_p: any, _v: any, work: any) => { if (beforeWork) await beforeWork; const result=await work(); if(holdAudit) await new Promise<void>(resolve=>audits.push(resolve)); return result; } },
  }, { AbortController });
  const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
  return { get opened() { return opened; }, waitBeforeWork: () => { beforeWork = new Promise<void>(resolve => { releaseWork=resolve; }); }, releaseWork: () => releaseWork?.(), holdAudit: () => { holdAudit=true; }, finishAudit: () => audits.forEach(resolve=>resolve()), mod, context, session, updates, returns, pushed, toasts, requests, flush,
    choose(via = false) { chosen = { station: { name: '주유소', latitude: 37.01, longitude: 127.01 }, via }; },
    finish(stations: any[] = []) { resolveFetch?.(stations); }, revoke() { allowed = false; revision++; },
    fail() { failure = true; }, pushFailure() { failPush = true; }, snapshot(value: any) { snapshot = { ...snapshot, ...value }; },
  };
}

test('주유소 조회는 유종/반경을 유지하고 중복 요청·0원·반경 밖 결과를 제외한다', async () => {
  const f = setup(); const first = f.mod.handleGuideGasMenu(106); await f.flush();
  const duplicate = f.mod.handleGuideGasMenu(106); await f.flush(); assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].prod,'B034'); assert.equal(f.requests[0].radius,5000);
  f.finish([{id:'a',price:2000,distance:100},{id:'free',price:0,distance:200},{id:'far',price:1500,distance:6000}]);
  await Promise.all([first,duplicate]); assert.deepEqual(f.updates[0].stations.map((s: any)=>s.id),['a']);
});
test('조회 중 동의를 철회하면 좌표 결과를 native로 보내지 않고 마커를 비운다', async () => {
  const f = setup(); const pending=f.mod.handleGuideGasMenu(106); await f.flush(); f.revoke(); f.finish([{price:1,distance:1}]); await pending;
  assert.equal(f.updates[0].stations.length,0); assert.equal(f.updates[0].error,'unavailable');
});
test('실패 응답은 새 가격으로 보이지 않고 오류·빈 마커를 전달한다', async () => {
  const f=setup(); f.fail(); await f.mod.handleGuideGasMenu(106); assert.equal(f.updates[0].error,'unavailable');
});
test('주유소 목적지는 미리보기에서만 바꾸고 현재 안내 목적지·경유는 유지한다', async () => {
  const f=setup(); f.snapshot({vias:[{name:'경유',latitude:38,longitude:128}]}); f.choose(); await f.mod.handleGuideGasMenu(108);
  assert.equal(f.session.goal.name,'원래 목적지'); assert.equal(f.session.preview.snapshot.goal.name,'주유소');
  assert.equal(f.session.preview.snapshot.goalReplaced,true); assert.equal(f.session.preview.snapshot.vias.length,1); assert.equal(f.pushed.length,1);
});
test('경유 추가는 첫 경유에 넣고 3개 제한은 기존 안내로 복귀한다', async () => {
  const f=setup(); f.choose(true); await f.mod.handleGuideGasMenu(108); assert.equal(f.session.preview.snapshot.vias[0].name,'주유소');
  const limited=setup(); limited.snapshot({vias:[{},{},{}]}); limited.choose(true); await limited.mod.handleGuideGasMenu(108);
  assert.deepEqual(limited.returns,[7]); assert.equal(limited.pushed.length,0);
});
test('코스는 경유 추가를 막고 새 목적지 확인 시 코스 경유를 제거한다', async () => {
  const f=setup(); f.session.goal.courseId='course'; f.snapshot({vias:[{name:'코스'}]}); f.choose(); await f.mod.handleGuideGasMenu(108);
  assert.equal(f.session.preview.snapshot.vias.length,0); assert.equal(f.session.goal.courseId,'course');
  const blocked=setup(); blocked.session.goal.courseId='course'; blocked.choose(true); await blocked.mod.handleGuideGasMenu(108); assert.equal(blocked.pushed.length,0);
});
test('화면 진입 실패는 미리보기 context를 지우고 기존 안내로 복귀한다', async () => {
  const f=setup(); f.choose(); f.pushFailure(); await f.mod.handleGuideGasMenu(108); assert.equal(f.session.preview,null); assert.deepEqual(f.returns,[7]);
});


test('확인자료 후처리가 지연돼도 다음 주유소 선택을 잠그지 않는다', async () => {
  const f=setup(); f.holdAudit(); f.choose(); const first=f.mod.handleGuideGasMenu(108); await f.flush();
  assert.equal(f.pushed.length,1); f.choose(); const second=f.mod.handleGuideGasMenu(108); await f.flush();
  assert.equal(f.pushed.length,2); f.finishAudit(); await Promise.all([first,second]);
});


test('확인자료 사전 기록 중 안내가 바뀌면 새 안내 미리보기를 열지 않는다', async () => {
  const f=setup(); f.waitBeforeWork(); f.choose(); const pending=f.mod.handleGuideGasMenu(108); await f.flush();
  f.session.goal={name:'새 안내'}; f.releaseWork(); await pending;
  assert.equal(f.opened,0); assert.equal(f.pushed.length,0); assert.equal(f.toasts.length,0);
});

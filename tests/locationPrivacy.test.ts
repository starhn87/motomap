import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from 'zustand/vanilla';
import { readFileSync } from 'node:fs';
import { loadModule } from './helpers/loadModule';
import type * as Privacy from '../stores/useLocationPrivacyStore';
import type * as Contract from '../lib/locationPrivacy';

const version = '2026-10-11-location-v2';
const active = { status: 'active', version, historyAllowed: true, historyCount: 3, providers: ['naver','kakao'] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve=done; });
  return { promise, resolve };
}
function fixture(options: { stop?: () => Promise<void>; rpc?: (action: string) => Promise<unknown>; storageFailure?: 'read' | 'write' } = {}) {
  let actor: string | null = 'A';
  const calls: { action: string; expectedActor: string | null; payload: unknown }[]=[];
  const positions: unknown[]=[];
  let stopped=0;
  let intent: 'pause' | 'withdraw' | 'withdraw_history' | null=null;
  const module=loadModule<typeof Privacy>('stores/useLocationPrivacyStore.ts', {
    zustand: { create: createStore },
    'expo-crypto': { randomUUID: () => 'event-id' },
    '@/lib/locationPrivacy': {
      LOCATION_CONSENT_VERSION: version, deviceLocationSecret: async () => 'a'.repeat(64),
      loadLocationStopIntent: async () => { if(options.storageFailure==='read') throw new Error('locked'); return intent; },
      saveLocationStopIntent: async (_actor: string | null,value: typeof intent) => {
        if(options.storageFailure==='write') throw new Error('locked');
        if (value===null) intent=null;
        else if (intent!=='withdraw' && !(intent==='withdraw_history' && value==='pause')) intent=value;
      },
      parseLocationPrivacy: (value: unknown) => value,
      setLocationHistoryEnabled: async (enabled: boolean,expectedActor: string) => {
        assert.equal(expectedActor,actor);
        calls.push({action:'history_setting',expectedActor,payload:{enabled}});
        return options.rpc ? options.rpc('history_setting') : {...active,historyAllowed:enabled};
      },
      privacyObject: (value: unknown) => value,
      PURPOSE_LABELS: { search: '주변 검색' }, RECIPIENT_LABELS: { kakao: '카카오' },
      locationPrivacyRpc: async (action: string, _secret: string, payload: unknown, expectedActor: string | null) => {
        assert.equal(expectedActor,actor);
        calls.push({ action,expectedActor,payload });
        if(action==='record') return {id:'event-id',createdAt:'2026-10-11T00:00:00Z'};
        return options.rpc ? options.rpc(action) : (action==='pause' || action==='withdraw' ? { ...active,status:'paused' } : active);
      },
    },
    '@/stores/useMapStore': { useMapStore: { setState: (value: unknown) => positions.push(value) } },
    '@/lib/guideSession': { useGuideSession: { getState: () => ({ goal: null,clear() {} }) } },
    '@/modules/kakao-navi': { __esModule: true, supportsKakaoNaviFeature: () => true,
      default: { stopLocationUse: async () => { stopped++; await options.stop?.(); } } },
    '@/lib/toast': { toast: { info() {} } },
    '@/lib/queryClient': {queryClient:{clear() {}}},
    '@/stores/useAuthStore': { useAuthStore: { getState: () => ({ status: actor ? 'signed_in' : 'signed_out',session: actor ? {user:{id:actor}} : null }) } },
  });
  const store=module.useLocationPrivacyStore;
  store.setState({ ...active,actor:'A',secret:'a'.repeat(64),ready:true,browsing:true } as never);
  return { ...module,store,calls,positions,stopped: () => stopped,actor: (next: string | null) => { actor=next; } };
}

test('미동의·중지·철회 상태에서는 위치 기능과 API 작업을 시작하지 않는다', async () => {
  const f=fixture(); let worked=0;
  for (const status of ['unknown','paused','withdrawn'] as const) {
    f.store.setState({ status });
    await assert.rejects(f.withLocationUse('search','kakao',async () => { worked++; }));
  }
  assert.equal(worked,0); assert.equal(f.calls.length,0);
});
test('공급자 미선택·계정 불일치도 요청 전에 차단한다', async () => {
  const f=fixture();
  f.store.setState({providers:['naver']});
  await assert.rejects(f.withLocationUse('search','kakao',async () => 1));
  f.actor('B'); assert.equal(f.locationUseAllowed(),false); assert.equal(f.calls.length,0);
});
test('확인자료는 좌표 대신 목적·공급자·결과만 전달한다', async () => {
  const f=fixture();
  assert.equal(await f.withCoordinateUse({latitude:37,longitude:127},'search','kakao',async () => 7),7);
  assert.deepEqual(f.calls.map(c=>c.action),['record','complete']);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].payload)),{ id:'event-id',purpose:'search',recipient:'kakao' });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].payload)),{ id:'event-id',outcome:'completed' });
});
test('철회·중지는 서버 대기 전 닫고 늦은 위치 응답은 반환하지 않는다', async () => {
  const work=deferred<number>(); const f=fixture();
  const request=f.withLocationUse('search','kakao',() => work.promise);
  await new Promise(done=>setImmediate(done));
  const paused=f.store.getState().change('pause');
  assert.equal(f.locationUseAllowed(),false);
  work.resolve(1);
  await assert.rejects(request); await paused;
  assert.ok(f.positions.length); assert.equal(f.stopped(),1);
});
test('결과 확인자료 저장 대기 중 중지해도 늦은 GPS를 호출자에게 반환하지 않는다', async () => {
  const complete=deferred<typeof active>();
  const f=fixture({rpc:async action=>action==='complete' ? complete.promise : active});
  const request=f.withLocationUse('search','kakao',async()=>1);
  await new Promise(done=>setImmediate(done));
  f.store.setState({status:'paused',revision:f.store.getState().revision+1});
  complete.resolve(active); await assert.rejects(request);
});
test('네이티브 중지 대기 중 계정이 바뀌면 새 계정 삭제 RPC를 호출하지 않는다', async () => {
  const stop=deferred<void>(); const f=fixture({stop:()=>stop.promise});
  const request=f.store.getState().change('withdraw');
  await new Promise(done=>setImmediate(done));
  f.actor('B'); f.store.setState({actor:'B'});
  stop.resolve(); await assert.rejects(request);
  assert.equal(f.calls.length,0);
});
test('늦은 재시작 응답은 이후 중지 상태를 active로 덮지 않는다', async () => {
  const resume=deferred<typeof active>();
  const f=fixture({rpc:async action=>action==='resume' ? resume.promise : {...active,status:'paused'}});
  const first=f.store.getState().change('resume');
  await new Promise(done=>setImmediate(done));
  const second=f.store.getState().change('pause');
  assert.equal(f.locationUseAllowed(),false);
  resume.resolve(active); await first; await second;
  assert.equal(f.store.getState().status,'paused');
  assert.deepEqual(f.calls.map(c=>c.action),['resume','pause']);
});
test('설정 조회·네이티브 중지 실패는 동의 완료로 간주하지 않는다', async () => {
  const f=fixture({stop:async()=>{throw new Error('native');}});
  await f.store.getState().load('A');
  assert.equal(f.locationUseAllowed(),false); assert.ok(f.store.getState().error);
});
test('중지 서버 요청 실패 후 cold-load도 명시적 재시작 전에는 닫힌다', async () => {
  const f=fixture({rpc:async action=>{if(action==='pause') throw new Error('offline'); return active;}});
  await assert.rejects(f.store.getState().change('pause'));
  await f.store.getState().load('A');
  assert.equal(f.locationUseAllowed(),false);
  await f.store.getState().change('resume');
  assert.equal(f.locationUseAllowed(),true);
});
test('방문 보유만 철회할 때 지도·길안내의 native 중지는 호출하지 않는다', async () => {
  const f=fixture({rpc:async()=>({...active,historyAllowed:false,historyCount:0})});
  await f.store.getState().change('withdraw_history');
  assert.equal(f.stopped(),0); assert.equal(f.locationUseAllowed(),true);
  assert.equal(f.store.getState().historyAllowed,false);
});

test('보안 저장소 조회·쓰기 실패와 무관하게 native 중지를 먼저 시도한다', async () => {
  for(const storageFailure of ['read','write'] as const) {
    for(const action of ['pause','withdraw','consent'] as const) {
      const f=fixture({storageFailure});
      await assert.rejects(action==='consent' ? f.store.getState().consent(true,true,false,[]) : f.store.getState().change(action));
      assert.equal(f.stopped(),1); assert.equal(f.locationUseAllowed(),false); assert.equal(f.calls.length,0);
    }
  }
});
test('미완료 방문 철회는 중지·재시작·개별 삭제로 소실되지 않는다', async () => {
  let failing=true; let server={...active};
  const f=fixture({rpc:async action=>{
    if(action==='withdraw_history') {
      if(failing) throw new Error('offline');
      server={...server,historyAllowed:false,historyCount:0};
    }
    if(action==='pause') server={...server,status:'paused'};
    if(action==='resume') server={...server,status:'active'};
    return server;
  }});
  await assert.rejects(f.store.getState().change('withdraw_history'));
  await f.store.getState().load('A');
  for (const action of ['pause','resume','delete_ride'] as const) {
    await assert.rejects(f.store.getState().change(action,'record-id'));
    await f.store.getState().load('A');
    assert.equal(f.locationUseAllowed(),false);
    assert.equal(f.store.getState().historyAllowed,false);
  }
  failing=false;
  await f.store.getState().change('resume');
  assert.equal(f.locationUseAllowed(),true);
  assert.equal(f.store.getState().historyAllowed,false);
  assert.equal(f.store.getState().historyCount,0);
});
test('기기 비밀값은 동시 요청에서도 보안 저장소에 한 번 생성한다', async () => {
  let saved: string | null=null; let generated=0;
  const module=loadModule<typeof Contract>('lib/locationPrivacy.ts', {
    'expo-crypto': {getRandomBytesAsync:async()=>{generated++; return new Uint8Array(32).fill(42);}},
    '@/lib/authStorage': {authStorage:{getItem:async()=>saved,setItem:async(_key:string,value:string)=>{saved=value;}}},
    '@/lib/supabase': {supabase:{}},
  });
  const [a,b]=await Promise.all([module.deviceLocationSecret(),module.deviceLocationSecret()]);
  assert.equal(a,b); assert.match(a,/^[a-f0-9]{64}$/); assert.equal(generated,1); assert.equal(a,saved);
});
test('서버 요청은 시작 당시 계정을 CAS 인자로 고정한다', async () => {
  let args: unknown;
  const module=loadModule<typeof Contract>('lib/locationPrivacy.ts', {
    'expo-crypto': {}, '@/lib/authStorage': {authStorage:{}},
    '@/lib/supabase': {supabase:{rpc: (_name: string,value:unknown) => { args=value; return {abortSignal:async()=>({data:{},error:null})};}}},
  },{AbortController});
  await module.locationPrivacyRpc('withdraw','private-token',{},'A');
  assert.deepEqual(JSON.parse(JSON.stringify(args)),{p_action:'withdraw',p_secret:'private-token',p_payload:{expectedActor:'A'}});
});
test('위치 관리 화면 전체를 마스킹하고 최초 동의는 별도 단일 화면에서 미선택이다', () => {
  const panel=readFileSync(new URL('../components/LocationPrivacyPanel.tsx',import.meta.url),'utf8');
  assert.match(panel,/<PostHogMaskView/); assert.match(panel,/<\/PostHogMaskView>/);
  const consent=readFileSync(new URL('../components/auth/LegalConsentScreen.tsx',import.meta.url),'utf8');
  assert.match(consent,/useState<Partial<Record<LegalDocType, boolean>>>\(\{\}\)/);
  assert.doesNotMatch(panel,/intro/);
});
test('기록 저장 스위치는 기존 자료·공급자·길안내를 건드리지 않는다', async()=>{
  const f=fixture();
  await f.store.getState().setHistoryAllowed(false);
  assert.equal(f.store.getState().historyAllowed,false);
  assert.equal(f.store.getState().historyCount,3);
  assert.deepEqual(f.store.getState().providers,active.providers);
  await f.store.getState().setHistoryAllowed(true);
  assert.equal(f.store.getState().historyAllowed,true);
  assert.equal(f.stopped(),0); assert.equal(f.positions.length,0);
  assert.deepEqual(f.calls.map(c=>c.action),['history_setting','history_setting']);
});
test('기록 설정 실패는 기록 저장을 닫고 재실행에서도 자동 재개하지 않는다', async()=>{
  const f=fixture({rpc:async action=>{if(action==='history_setting') throw new Error('offline'); return active;}});
  await assert.rejects(f.store.getState().setHistoryAllowed(false));
  assert.equal(f.store.getState().status,'paused'); assert.equal(f.stopped(),1);
  await f.store.getState().load('A');
  assert.equal(f.store.getState().status,'paused'); assert.equal(f.store.getState().historyAllowed,false);
});
test('늦은 기록 설정 응답은 이후 위치 중지를 active로 되돌리지 않는다', async()=>{
  const pending=deferred<unknown>();
  const f=fixture({rpc:async action=>action==='history_setting' ? pending.promise : {...active,status:'paused'}});
  const setting=f.store.getState().setHistoryAllowed(false);
  await new Promise(done=>setTimeout(done,0));
  const pause=f.store.getState().change('pause');
  pending.resolve({...active,historyAllowed:false});
  await Promise.all([setting,pause]);
  assert.equal(f.store.getState().status,'paused'); assert.equal(f.locationUseAllowed(),false);
});
test('같은 계정의 토큰 갱신·약관 완료는 위치 상태를 재초기화하지 않는다',()=>{
  const root=readFileSync(new URL('../components/ActiveRootLayout.tsx',import.meta.url),'utf8');
  const body=root.match(/useEffect\(\(\) => \{([\s\S]*?)\},\[actor,authStatus\]\)/)?.[1];
  assert.ok(body);
  const execute=new Function('authStatus','actor','privacyScope','useLocationPrivacyStore',body);
  const scope={current:undefined as string | null | undefined}; const calls: unknown[]=[];
  const store={getState:()=>({load:(actor:unknown)=>{calls.push(actor); return Promise.resolve();}})};
  execute('restoring',null,scope,store); assert.equal(calls.length,0);
  execute('needs_consent','A',scope,store);
  execute('restoring','A',scope,store); execute('signed_in','A',scope,store);
  assert.deepEqual(calls,['A']);
  execute('signed_out',null,scope,store); assert.deepEqual(calls,['A',null]);
});
test('기록 삭제 후 재조회는 렌더 시점이 아닌 조회 시작 상태를 기준으로 갱신한다', async () => {
  const panel=readFileSync(new URL('../components/LocationPrivacyPanel.tsx',import.meta.url),'utf8');
  const AsyncFunction=Object.getPrototypeOf(async function() {}).constructor;
  for (const name of ['loadEvents','loadRides']) {
    const body=panel.match(new RegExp(`async function ${name}\\(more = false\\) \\{([\\s\\S]*?)\\n  \\}`))?.[1];
    assert.ok(body);
    const request=new AsyncFunction('more','state','useLocationPrivacyStore','locationPrivacyRpc',
      'events','rides','listFrom','setEvents','setRides','setLoadedEvents','setLoadedRides','useAuthStore',
      body.replace(/listFrom<[^>]+>/g,'listFrom'));
    const rendered={actor:'A',secret:'private',revision:1};
    let current={...rendered,revision:3}; let applied=0; let requested=0;
    let onRequest=() => {};
    const invoke=()=>request(false,rendered,{getState:()=>({...current})},async()=>{requested++; onRequest(); return {};},
      [],[],()=>[],()=>{applied++;},()=>{applied++;},()=>{},()=>{}, {getState:()=>({session:{user:{id:'A'}}})});
    await invoke();
    assert.equal(applied,1,'삭제로 revision이 증가해도 현재 조회 결과는 반영한다');
    onRequest=()=>{current={...current,revision:current.revision+1};};
    await invoke();
    assert.equal(applied,1,'조회 도중 동의 상태가 바뀌면 이전 응답은 버린다');
    current={...current,actor:'B'};
    await invoke();
    assert.equal(requested,2,'이전 계정 렌더에서는 새 계정 자료를 요청하지 않는다');
  }
});
test('native 시작·경로·중지는 main 큐에서 직렬화하고 늦은 콜백도 동의 확인한다', () => {
  const swift=readFileSync(new URL('../modules/kakao-navi/ios/KakaoNaviModule.swift',import.meta.url),'utf8');
  for (const name of ['initialize','setLocationUseAllowed','stopLocationUse','requestBikeRoute','startGuide']) {
    const body=swift.split(`AsyncFunction("${name}")`)[1].split('AsyncFunction(')[0];
    assert.match(body,/\.runOnQueue\(\.main\)/);
  }
  const native=readFileSync(new URL('../modules/kakao-navi/ios/KNNaviPresenter.m',import.meta.url),'utf8');
  assert.match(native,/generation == gLocationGeneration && \[KNSDKBridge isLocationUseAllowed\]/);
  assert.match(native,/navi != gActiveNavi \|\| navi.finished/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { insidePoiBounds, limitGuidePoiCandidates, mergeGuidePois, poiPriority, validPoiBounds } from '../lib/guidePoiCatalog';
import { haversine } from '../lib/distance';

function store<T>(initial:T) {
  let state=initial;const listeners=new Set<(state:T,previous:T)=>void>();
  return {getState:()=>state,subscribe:(listener:(state:T,previous:T)=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    set:(next:T)=>{const previous=state;state=next;listeners.forEach(fn=>fn(state,previous));}};
}
function setup(capability=true,gasAllowed=false,ordinaryPois:any[]=[] ) {
  const visit={},guide=store<any>({goal:{visitIdentity:visit},preview:null});
  const auth=store<any>({session:{user:{id:'actor-a'}}}),privacy=store({revision:1}),personal=store({places:{},load:async()=>{}});
  let allowed=true,context:any={requestId:'first',bounds:{south:37.49,west:126.99,north:37.51,east:127.01}},selection:any=null,accepted=true;
  let favoriteChange=()=>{},resets=0,clears=0,ordinaryCalls=0;
  const events:Record<string,(value:any)=>void>={},updates:any[]=[],opens:any[]=[],calls:any[]=[],resolvers:((value:any)=>void)[]=[];
  const module=loadModule<typeof import('../lib/guidePoiEvents')>('lib/guidePoiEvents.ts',{
    '@/modules/kakao-navi':{__esModule:true,supportsKakaoNaviFeature:()=>capability,default:{
      addListener:(event:string,fn:any)=>{events[event]=fn;return {remove:()=>{delete events[event];}};},
      getGuidePoiContext:async()=>context,takeGuidePoiSelection:async()=>selection,
      setGuideOwnedPoiEnabled:async()=>{},resetGuidePoiSnapshot:async()=>{resets++;},
      updateGuidePoiSnapshot:async(json:string)=>{updates.push(JSON.parse(json));return accepted;},
    }},
    '@/lib/api/guidePois':{},'@/lib/api/gasStations':{},
    '@/lib/api/guideOrdinaryPois':{clearGuideOrdinaryPoiCache:()=>{},fetchGuideOrdinaryPois:async()=>{ordinaryCalls++;return {pois:ordinaryPois,partial:false};}},
    '@/lib/guidePoiData':{GuidePoiData:class {
      clear(){clears++;}invalidateFavorites(){}
      load(...args:any[]){calls.push(args);return new Promise(resolve=>resolvers.push(resolve));}
    }},
    '@/lib/guidePoiCatalog':{insidePoiBounds,limitGuidePoiCandidates,mergeGuidePois,poiPriority,validPoiBounds},'@/lib/distance':{haversine},
    '@/lib/guidePoiChanges':{listenGuideFavoritesChanged:(fn:any)=>{favoriteChange=fn;return ()=>{};}},
    '@/stores/useAuthStore':{useAuthStore:auth},'@/stores/useMyPlacesStore':{useMyPlacesStore:personal},
    '@/stores/useLocationPrivacyStore':{useLocationPrivacyStore:privacy,providerLocationAllowed:(recipient:string)=>allowed && (recipient!=='opinet'||gasAllowed)},
    '@/lib/guideSession':{useGuideSession:guide},
  },{AbortController});
  const cleanup=module.registerGuidePoiEvents(async(point,current)=>{opens.push({point,current});});
  const poi={key:'place:verified',placeId:'verified',name:'저장한 장소',favorite:true,latitude:37.5,longitude:127};
  return {events,updates,opens,calls,auth,guide,privacy,cleanup,poi,get resets(){return resets;},get ordinaryCalls(){return ordinaryCalls;},get clears(){return clears;},
    favoriteChange:()=>favoriteChange(),setContext:(value:any)=>{context=value;},setSelection:(value:any)=>{selection=value;},setAccepted:(value:boolean)=>{accepted=value;},
    revoke:()=>{allowed=false;privacy.set({revision:2});},resolve:(index=0,pois:any[]=[poi])=>resolvers[index]({pois,expiresAt:Date.now()+60_000}),
    flush:async()=>{for(let i=0;i<30;i++)await Promise.resolve();}};
}
test('새 capability가 없는 바이너리에는 자체 POI 요청·구독을 열지 않는다',()=>{
  const f=setup(false);assert.deepEqual(Object.keys(f.events),[]);f.cleanup();
});
test('네이티브 수신 확인 뒤 안정 키로 등록 장소를 선택하고 주소/서버ID는 표시 payload에서 뺀다',async()=>{
  const f=setup();f.events.onGuideMenu({id:110});await f.flush();f.resolve();await f.flush();
  assert.equal(f.updates[0].pois[0].placeId,undefined);
  f.setSelection({snapshotId:'first',key:'place:verified'});f.events.onGuideMenu({id:111});await f.flush();
  assert.equal(f.opens[0].point.placeId,'verified');assert.equal(f.opens[0].current(),true);
  f.revoke();assert.equal(f.opens[0].current(),false);f.cleanup();
});
for(const event of ['account','privacy','end','favorite'] as const) {
  test(`조회 중 ${event} 변경은 요청을 중단하고 늦은 장소를 표시하지 않는다`,async()=>{
    const f=setup();f.events.onGuideMenu({id:110});await f.flush();
    if(event==='account')f.auth.set({session:{user:{id:'actor-b'}}});
    if(event==='privacy')f.revoke();
    if(event==='end'){f.guide.set({goal:null,preview:null});f.events.onGuideEnd({});}
    if(event==='favorite')f.favoriteChange();
    assert.equal(f.calls[0][3].aborted,true);f.resolve();await f.flush();
    assert.equal(f.updates.length,0);f.cleanup();
  });
}
test('늦은 영역 응답과 네이티브가 거절한 snapshot의 선택은 적용하지 않는다',async()=>{
  const f=setup();f.events.onGuideMenu({id:110});await f.flush();
  f.setContext({requestId:'second',bounds:{south:37.49,west:126.99,north:37.51,east:127.01}});
  f.events.onGuideMenu({id:110});await f.flush();f.resolve(0);await f.flush();
  assert.equal(f.updates.length,0);f.setAccepted(false);f.resolve(1);await f.flush();
  f.setSelection({snapshotId:'second',key:'place:verified'});f.events.onGuideMenu({id:111});await f.flush();
  assert.equal(f.opens.length,0);f.cleanup();
});
test('느린 유가 응답을 기다리지 않고 저장 장소를 먼저 표시한다',async()=>{
  const f=setup(true,true);f.events.onGuideMenu({id:110});await f.flush();f.resolve(0);await f.flush();
  assert.equal(f.updates.length,1);assert.equal(f.calls.length,2);
  f.setSelection({snapshotId:'first',key:'place:verified'});f.events.onGuideMenu({id:111});await f.flush();
  assert.equal(f.opens.length,1);f.resolve(1);await f.flush();assert.equal(f.updates.length,2);f.cleanup();
});
test('SDK 기본 POI 위에는 집·회사·즐겨찾기·가격 있는 주유소만 보내고 일반 장소는 조회하지 않는다',async()=>{
  const point={key:'kakao:ordinary',providerId:'ordinary',name:'편의점',latitude:37.5,longitude:127};
  const f=setup(true,false,[point]);f.events.onGuideMenu({id:110});await f.flush();
  f.resolve(0,[f.poi,
    {key:'place:registered',placeId:'registered',name:'등록 카페',category:'cafe',latitude:37.5,longitude:127},
    {key:'personal:home',name:'집',personal:'home',latitude:37.501,longitude:127},
    {key:'gas:priced',gasId:'priced',name:'가격 주유소',category:'gas_station',brand:'S-OIL',price:1699,latitude:37.502,longitude:127},
    {key:'gas:plain',gasId:'plain',name:'가격 없는 주유소',category:'gas_station',brand:'S-OIL',latitude:37.503,longitude:127}]);
  await f.flush();
  assert.deepEqual(f.updates.at(-1).pois.map((p:any)=>p.key).sort(),['gas:priced','personal:home','place:verified']);
  assert.equal(f.ordinaryCalls,0);f.cleanup();
});

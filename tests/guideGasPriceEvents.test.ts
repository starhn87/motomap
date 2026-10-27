import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup() {
  let context: any={requestId:'first',latitude:37.5,longitude:127};
  let allowed=true,revision=1;
  const calls:any[]=[],updates:any[]=[];
  const resolvers:((value:any)=>void)[]=[];
  const module=loadModule<{handleGuideGasPrices():Promise<void>;cancelGuideGasPrices():void}>('lib/guideGasPriceEvents.ts',{
    '@/modules/kakao-navi':{__esModule:true,default:{getGuideGasPriceContext:async()=>context,updateGuideGasPriceMarkers:async(json:string)=>{updates.push(JSON.parse(json));}}},
    '@/lib/api/gasStations':{fetchNearbyGasStationsSnapshot:(params:any)=>{calls.push(params);return new Promise(resolve=>resolvers.push(resolve));}},
    '@/lib/distance':{haversine:(_center:any,station:any)=>station.distance},
    '@/stores/useLocationPrivacyStore':{providerLocationAllowed:()=>allowed,useLocationPrivacyStore:{getState:()=>({revision})}},
  },{AbortController});
  const snapshot={stations:[{id:'valid',name:'검사 주유소',price:1699,distance:100},{id:'zero',price:0,distance:20},{id:'far',price:1000,distance:5001}],fetchedAt:100,expiresAt:200};
  return {module,calls,updates,snapshot,resolve:(i=0)=>resolvers[i](snapshot),setContext:(value:any)=>{context=value;},revoke:()=>{allowed=false;revision++;},flush:async()=>{for(let i=0;i<10;i++)await Promise.resolve();}};
}
test('가격 말풍선은 일반휘발유 5km 양수 가격만 보내고 서버 원본 만료를 유지한다',async()=>{
  const f=setup();const work=f.module.handleGuideGasPrices();await f.flush();
  assert.equal(f.calls[0].prod,'B027');assert.equal(f.calls[0].radius,5000);
  f.resolve();await work;
  assert.deepEqual(f.updates[0].stations.map((s:any)=>s.id),['valid']);
  assert.equal(f.updates[0].fetchedAt,100);assert.equal(f.updates[0].expiresAt,200);
});
test('같은 native 요청은 동시에 두 번 조회하지 않는다',async()=>{
  const f=setup();const first=f.module.handleGuideGasPrices();await f.flush();
  await f.module.handleGuideGasPrices();assert.equal(f.calls.length,1);f.resolve();await first;
});
for(const event of ['revoke','cancel'] as const){
  test(`가격 조회 중 ${event}이면 늦은 가격으로 지도를 채우지 않는다`,async()=>{
    const f=setup();const work=f.module.handleGuideGasPrices();await f.flush();
    if(event==='revoke')f.revoke();else f.module.cancelGuideGasPrices();
    f.resolve();await work;assert.equal(f.updates.length,0);
  });
}
test('새 지도 조회는 이전 요청을 취소하고 이전 응답이 새 context에 쓰이지 않는다',async()=>{
  const f=setup();const first=f.module.handleGuideGasPrices();await f.flush();
  f.setContext({requestId:'second',latitude:37.51,longitude:127});
  const second=f.module.handleGuideGasPrices();await f.flush();assert.equal(f.calls[0].signal.aborted,true);
  f.resolve(0);await first;assert.equal(f.updates.length,0);
  f.resolve(1);await second;assert.equal(f.updates[0].requestId,'second');
});
test('native context가 없으면 가격 조회를 시작하지 않는다',async()=>{
  const f=setup();f.setContext(null);await f.module.handleGuideGasPrices();assert.equal(f.calls.length,0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { insidePoiBounds, validPoiBounds } from '../lib/guidePoiCatalog';
import { haversine } from '../lib/distance';
import { ProviderError, providerHttpError } from '../lib/providerErrors';

const bounds={south:37.499,west:126.999,north:37.501,east:127.001};
function setup(options:{allowed?:boolean;status?:number;invalid?:boolean}={}) {
  const requests:URL[]=[],failures:unknown[]=[];let running=0,peak=0,coordinateUses=0;
  const api=loadModule<typeof import('../lib/api/guideOrdinaryPois')>('lib/api/guideOrdinaryPois.ts',{
    '@/stores/useLocationPrivacyStore':{providerLocationAllowed:()=>options.allowed!==false,withCoordinateUse:async(_p:any,_purpose:any,_provider:any,work:any)=>{coordinateUses++;return work();}},
    '@/lib/providerErrors':{ProviderError,providerHttpError,rememberProviderFailure:(e:any)=>failures.push(e),requireProviderAvailable:()=>{}},
    '@/lib/guidePoiCatalog':{insidePoiBounds,validPoiBounds},'@/lib/distance':{haversine},
  },{process:{env:{EXPO_PUBLIC_KAKAO_REST_API_KEY:'test-only'}},AbortController,fetch:async(url:string)=>{
    requests.push(new URL(url));running++;peak=Math.max(peak,running);await Promise.resolve();running--;
    const category=new URL(url).searchParams.get('category_group_code');
    return {ok:!options.status,status:options.status??200,json:async()=>({meta:{is_end:false},documents:[{
      id:category,place_name:'일반 장소',x:options.invalid?'':String(127),y:'37.5',address_name:'주소',road_address_name:'도로명',
    }]})};
  }});
  return {api,requests,failures,get peak(){return peak;},get coordinateUses(){return coordinateUses;}};
}
test('일반 장소는 6종 첫 페이지를 최대3개씩 조회하고 추천 등록 ID를 만들지 않는다',async()=>{
  const f=setup(),signal=new AbortController().signal;
  const result=await f.api.fetchGuideOrdinaryPois(bounds,signal);
  assert.equal(result.pois.length,6);assert.equal(result.partial,false);assert.equal(f.requests.length,6);assert(f.peak<=3);
  assert.equal(f.coordinateUses,6);
  for(const request of f.requests){assert.equal(request.searchParams.get('page'),'1');assert.equal(request.searchParams.get('size'),'15');assert.equal(request.searchParams.get('rect'),'126.999,37.499,127.001,37.501');}
  assert(result.pois.every(p=>p.providerId&&!p.placeId&&!p.generalPlaceId&&!p.category));
  await f.api.fetchGuideOrdinaryPois(bounds,signal);assert.equal(f.requests.length,12,'일반 검색 응답은 별도 영역 캐시로 재사용하지 않는다');
});
test('넓은 개요도 중심 주변으로 조회 범위를 줄이며 일반 장소를 통째로 생략하지 않는다',async()=>{
  const f=setup();await f.api.fetchGuideOrdinaryPois({south:37.4,west:126.9,north:37.6,east:127.1},new AbortController().signal);
  assert.equal(f.requests.length,6);
  for(const request of f.requests){
    const [west,south,east,north]=request.searchParams.get('rect')!.split(',').map(Number);
    assert(north-south<0.05);assert(east-west<0.06);assert(south<37.5&&north>37.5&&west<127&&east>127);
  }
});
test('동의 없음·취소 상태에서는 일반 장소를 조회하지 않는다',async()=>{
  const f=setup();
  const denied=setup({allowed:false});await assert.rejects(denied.api.fetchGuideOrdinaryPois(bounds,new AbortController().signal));assert.equal(denied.requests.length,0);
  const controller=new AbortController();controller.abort();await assert.rejects(f.api.fetchGuideOrdinaryPois(bounds,controller.signal));assert.equal(f.requests.length,0);
});
test('3D 화면은 bbox 평균 대신 네이티브가 투영한 실제 화면 중앙 주변을 조회한다',async()=>{
  const f=setup();await f.api.fetchGuideOrdinaryPois({south:37.4,west:126.9,north:37.6,east:127.1},new AbortController().signal,{latitude:37.45,longitude:127.04});
  assert.equal(f.requests.length,6);
  for(const request of f.requests){assert.equal(request.searchParams.get('x'),'127.04');assert.equal(request.searchParams.get('y'),'37.45');}
});
test('공급자 오류와 잘못된 좌표는 정상 빈 결과로 취급하지 않는다',async()=>{
  for(const options of [{status:429},{invalid:true}]) {
    const f=setup(options),result=await f.api.fetchGuideOrdinaryPois(bounds,new AbortController().signal);
    assert.equal(result.partial,true);assert.equal(result.pois.length,0);assert(f.failures.length>0);
    assert(f.requests.length<=6);
  }
});

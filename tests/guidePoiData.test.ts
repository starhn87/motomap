import assert from 'node:assert/strict';
import test from 'node:test';
import { GuidePoiData } from '../lib/guidePoiData';
import { mergeGuidePois, GuidePoiRegionCache } from '../lib/guidePoiCatalog';
import type { GuidePoi } from '../lib/guidePoiCatalog';
import { loadModule } from './helpers/loadModule';

const bounds={south:37.499,west:126.999,north:37.501,east:127.001};
const point={latitude:37.5,longitude:127};
const registered:GuidePoi={...point,key:'place:a',placeId:'a',name:'카페',providerId:'10',category:'cafe'};
function setup() {
  let now=1_000_000,places=0,favorites=0,gas=0;
  const service=new GuidePoiData({now:()=>now,
    places:async()=>{places++;return [registered];},favorites:async()=>{favorites++;return [{...registered,favorite:true}];},
    personal:async()=>({home:{...point,name:'집',address:'주소'}}),
    gas:async()=>{gas++;return {fetchedAt:now-1800_000,expiresAt:now+1800_000,stations:[
      {...point,id:'zero',name:'가격 없음',brand:'S-OIL',price:0,distance:10,isSelf:true},
      {...point,id:'priced',name:'가격 있음',brand:'S-OIL',price:1699,distance:20,isSelf:true},
    ]};},
  });
  return {service,counts:()=>({places,favorites,gas}),advance:(ms:number)=>{now+=ms;}};
}
test('등록·저장·주유소는 원본 ID로 통합하고 가까운 다른 주유소에 가격을 붙이지 않는다',()=>{
  const rows=mergeGuidePois([registered,{...registered,key:'favorite:1',favorite:true},
    {...point,key:'gas:x',gasId:'x',name:'주유소',price:1500}],bounds);
  assert.equal(rows.length,2);assert.equal(rows[0].placeId,'a');assert.equal(rows[0].favorite,true);
  assert.equal(rows[0].price,undefined);assert.equal(rows[1].price,1500);
});
test('동일 외부 ID를 주장하는 서로 다른 등록 장소는 일반 즐겨찾기를 임의 흡수하지 않는다',()=>{
  const result=mergeGuidePois([{...point,key:'general:x',generalPlaceId:'x',providerId:'10',name:'저장 장소'},
    registered,{...registered,key:'place:b',placeId:'b'}],bounds);
  assert.equal(result.length,3);
  assert.equal(result.find(row=>row.generalPlaceId==='x')?.placeId,undefined);
});
test('5분 등록 캐시·즐겨찾기 무효화·유가 원본 1시간 만료를 분리한다',async()=>{
  const f=setup();const signal=new AbortController().signal;
  const first=await f.service.load(bounds,true,true,signal);
  assert.equal(first.pois.find(row=>row.gasId==='zero')?.price,undefined);
  assert.ok(first.pois.some(row=>row.personal==='home'));
  await f.service.load(bounds,true,true,signal);assert.deepEqual(f.counts(),{places:1,favorites:1,gas:1});
  f.service.invalidateFavorites();await f.service.load(bounds,true,true,signal);
  assert.deepEqual(f.counts(),{places:1,favorites:2,gas:1});
  f.advance(300_001);await f.service.load(bounds,true,true,signal);
  assert.deepEqual(f.counts(),{places:2,favorites:3,gas:1});
  f.advance(1500_000);await f.service.load(bounds,true,true,signal);
  assert.equal(f.counts().gas,2);
});
test('비회원·오피넷 미선택이면 개인 서버 조회와 외부 유가 조회를 하지 않는다',async()=>{
  const f=setup();await f.service.load(bounds,false,false,new AbortController().signal);
  assert.deepEqual(f.counts(),{places:1,favorites:0,gas:0});
});
test('같은 건물의 다른 점포가 집의 아이콘·등록 ID를 상속하지 않는다',async()=>{
  const service=new GuidePoiData({places:async()=>[{...registered,name:'다른 카페',address:'같은 주소',longitude:127.0001}],
    favorites:async()=>[],personal:async()=>({home:{...point,name:'집',address:'같은 주소'}}),gas:async()=>{throw Error();}});
  const result=await service.load(bounds,false,false,new AbortController().signal);
  const home=result.pois.find(row=>row.personal==='home')!;
  assert.equal(home.placeId,undefined);assert.equal(home.longitude,127);
  assert.equal(result.pois.find(row=>row.placeId==='a')?.personal,undefined);
});
test('오피넷 실패만으로 등록 장소를 지우지 않고 재시도 만료를 짧게 둔다',async()=>{
  const service=new GuidePoiData({now:()=>1000,places:async()=>[registered],favorites:async()=>[],personal:async()=>({}),gas:async()=>{throw Error('network');}});
  const result=await service.load(bounds,false,true,new AbortController().signal);
  assert.equal(result.pois[0].placeId,'a');assert.equal(result.expiresAt,31_000);
});
test('필수 등록 조회 실패와 중지된 요청을 정상 빈 결과로 취급하지 않는다',async()=>{
  const service=new GuidePoiData({places:async()=>{throw Error('database');},favorites:async()=>[],personal:async()=>({}),gas:async()=>{throw Error();}});
  await assert.rejects(service.load(bounds,false,false,new AbortController().signal),/database/);
  const f=setup(),controller=new AbortController();controller.abort();
  await assert.rejects(f.service.load(bounds,true,true,controller.signal),/aborted/);
});
test('캐시는 범위 밖으로 이동하거나 원본 만료가 지나면 재사용하지 않는다',()=>{
  const cache=new GuidePoiRegionCache<string>();cache.set(bounds,'cached',100);
  assert.equal(cache.get(bounds,99)?.value,'cached');assert.equal(cache.get(bounds,100),undefined);
  cache.set(bounds,'cached',200);assert.equal(cache.get({...bounds,east:128},101),undefined);
});
test('지도 전용 조회는 251번째 행을 다음 페이지로 넘기고 커서를 진행한다',async()=>{
  const api=loadModule<typeof import('../lib/api/guidePois')>('lib/api/guidePois.ts',{
    '@/lib/supabase':{},'@/stores/useLocationPrivacyStore':{},'@/lib/guidePoiCatalog':{},
  });
  const pages:(string|undefined)[]=[];
  const rows=await api.collectGuidePoiPages(async after=>{
    pages.push(after);
    return Array.from({length:after?1:251},(_,i)=>({id:String(after?250:i).padStart(4,'0')}));
  },new AbortController().signal);
  assert.equal(rows.length,251);assert.deepEqual(pages,[undefined,'0249']);
  await assert.rejects(api.collectGuidePoiPages(async()=>Array.from({length:251},()=>({id:'same'})),new AbortController().signal),/invalid_poi_page|invalid_poi_cursor/);
});

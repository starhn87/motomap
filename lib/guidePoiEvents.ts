import KakaoNavi, { supportsKakaoNaviFeature } from '@/modules/kakao-navi';
import { fetchGuideFavorites } from '@/lib/api/guidePois';
import { fetchNearbyGasStationsSnapshot } from '@/lib/api/gasStations';
import { GuidePoiData } from '@/lib/guidePoiData';
import { insidePoiBounds, limitGuidePoiCandidates, poiPriority, validPoiBounds, type GuidePoi } from '@/lib/guidePoiCatalog';
import { haversine } from '@/lib/distance';
import { listenGuideFavoritesChanged } from '@/lib/guidePoiChanges';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';
import { providerLocationAllowed, useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { useGuideSession } from '@/lib/guideSession';

type Scope={actor:string|null;revision:number;visit:object;data:GuidePoiData};
type OpenPoi=(point:GuidePoi,current:()=>boolean)=>Promise<void>;

// SDK 기본 POI 는 켜 둔 채 기본 지도에 없는 것만 마커로 얹는다(NAV-058).
const augmentsBaseMap=(poi:GuidePoi)=>!!poi.personal || !!poi.favorite || (poi.price??0)>0;

// 새 capability가 있는 바이너리만 참여한다. 실패해도 안내 중 SDK 상호와 자체 표시를 섞지 않는다.
export function registerGuidePoiEvents(open:OpenPoi):()=>void {
  if(!supportsKakaoNaviFeature('guide_owned_poi'))return ()=>{};
  let disposed=false,scope:Scope|null=null;
  let pending:{id:string;controller:AbortController;timeout?:ReturnType<typeof setTimeout>}|null=null;
  let catalog:{snapshotId:string;scope:Scope;expiresAt:number;points:Map<string,GuidePoi>}|null=null;
  function cancel() {if(pending)clearTimeout(pending.timeout);pending?.controller.abort();pending=null;}
  function valid(current:Scope) {
    const privacy=useLocationPrivacyStore.getState(),auth=useAuthStore.getState();
    return !disposed && scope===current && providerLocationAllowed('kakao') &&
      privacy.revision===current.revision && (auth.session?.user.id??null)===current.actor &&
      useGuideSession.getState().goal?.visitIdentity===current.visit && !useGuideSession.getState().preview;
  }
  function sync() {
    const privacy=useLocationPrivacyStore.getState(),auth=useAuthStore.getState(),session=useGuideSession.getState();
    const actor=auth.session?.user.id??null,visit=session.goal?.visitIdentity;
    if(scope && scope.actor===actor && scope.revision===privacy.revision && scope.visit===visit && providerLocationAllowed('kakao')) {
      if(session.preview){cancel();catalog=null;}
      return;
    }
    cancel();catalog=null;scope?.data.clear();scope=null;
    void KakaoNavi.resetGuidePoiSnapshot().catch(()=>{});
    if(!visit || !providerLocationAllowed('kakao'))return;
    scope={actor,revision:privacy.revision,visit,data:new GuidePoiData({
      // 등록 장소는 기본 POI 와 겹치므로 조회하지 않는다.
      places:async()=>[],favorites:fetchGuideFavorites,
      gas:(center,signal)=>fetchNearbyGasStationsSnapshot({...center,prod:'B027',radius:5000,preciseCenter:true,signal}),
      personal:async()=>{await useMyPlacesStore.getState().load();return useMyPlacesStore.getState().places;},
    })};
  }
  async function request() {
    sync();const current=scope;
    if(!current || !valid(current))return;
    const context=await KakaoNavi.getGuidePoiContext();
    if(!context || !valid(current) || pending?.id===context.requestId)return;
    cancel();
    const work={id:context.requestId,controller:new AbortController(),timeout:undefined as ReturnType<typeof setTimeout>|undefined};pending=work;
    const live=()=>pending===work && !work.controller.signal.aborted && valid(current);
    const timeout=setTimeout(()=>work.controller.abort(),18_000);
    work.timeout=timeout;
    let basePayload:{requestId:string;pois:object[];expiresAt:number}|null=null;
    let basePublished=false;
    try {
      if(!validPoiBounds(context.bounds))throw new Error('invalid_bounds');
      const center=context.center && insidePoiBounds(context.center,context.bounds)?context.center:
        {latitude:(context.bounds.south+context.bounds.north)/2,longitude:(context.bounds.west+context.bounds.east)/2};
      async function publish(result:Awaited<ReturnType<GuidePoiData['load']>>) {
        if(!live())return null;
        const points=limitGuidePoiCandidates(result.pois.filter(augmentsBaseMap).sort((a,b)=>poiPriority(a)-poiPriority(b)||haversine(center,a)-haversine(center,b)));
        // 주소·서버 ID는 JS catalog에만 두고 표시용 최소 항목만 네이티브에 전달한다.
        const pois=points.map(({key,name,latitude,longitude,category,industry,personal,favorite,brand,price,gasId})=>
          ({key,name:name.trim().slice(0,200),latitude,longitude,category,industry,personal,favorite,brand,price,gasId}));
        const payload={requestId:context!.requestId,pois,expiresAt:result.expiresAt};
        const accepted=await KakaoNavi.updateGuidePoiSnapshot(JSON.stringify(payload));
        if(accepted && live())catalog={snapshotId:context!.requestId,scope:current!,expiresAt:result.expiresAt,points:new Map(points.map(point=>[point.key,point]))};
        return {accepted:accepted && live(),payload};
      }
      // 느린 오피넷 응답 때문에 이동 중 기본 장소 전환까지 계속 지연시키지 않는다.
      const base=await current.data.load(context.bounds,!!current.actor,false,work.controller.signal);
      const first=await publish(base);basePublished=!!first?.accepted;basePayload=first?.payload??null;
      // 가격은 느린 오피넷 응답 뒤 같은 snapshot 의 후속으로 보탠다. 실패하면 아래에서 짧은 만료로 다시 조회한다.
      if(basePublished && providerLocationAllowed('opinet'))
        await publish(await current.data.load(context.bounds,!!current.actor,true,work.controller.signal));
    } catch {
      if(pending===work && valid(current)) {
        if(!basePublished)catalog=null;
        if(basePublished && basePayload) {
          await KakaoNavi.updateGuidePoiSnapshot(JSON.stringify({...basePayload,expiresAt:Math.min(basePayload.expiresAt,Date.now()+30_000)})).catch(()=>{});
        } else await KakaoNavi.updateGuidePoiSnapshot(JSON.stringify({requestId:context.requestId,error:'unavailable'})).catch(()=>{});
      }
    } finally {clearTimeout(timeout);if(pending===work)pending=null;}
  }
  async function select() {
    const event=await KakaoNavi.takeGuidePoiSelection(),source=catalog;
    if(!event || !source || source.snapshotId!==event.snapshotId || source.expiresAt<=Date.now() || !valid(source.scope))return;
    const point=source.points.get(event.key);
    if(point)await open(point,()=>valid(source.scope) && source.expiresAt>Date.now());
  }
  function refreshFavorites() {
    cancel();catalog=null;scope?.data.invalidateFavorites();
    void KakaoNavi.resetGuidePoiSnapshot().catch(()=>{});
  }
  const menu=KakaoNavi.addListener('onGuideMenu',({id})=>{
    if(id===110)void request().catch(()=>{});
    if(id===111)void select().catch(()=>{});
  });
  const end=KakaoNavi.addListener('onGuideEnd',()=>{cancel();catalog=null;scope?.data.clear();scope=null;});
  const unsubscribe=[useAuthStore.subscribe(sync),useLocationPrivacyStore.subscribe(sync),useGuideSession.subscribe(sync),
    useMyPlacesStore.subscribe((state,previous)=>{if(state.places!==previous.places)refreshFavorites();}),listenGuideFavoritesChanged(refreshFavorites)];
  sync();void KakaoNavi.setGuideOwnedPoiEnabled(true).catch(()=>{});
  return ()=>{
    disposed=true;cancel();catalog=null;scope?.data.clear();scope=null;
    menu.remove();end.remove();unsubscribe.forEach(remove=>remove());
    void KakaoNavi.setGuideOwnedPoiEnabled(false).catch(()=>{});
  };
}

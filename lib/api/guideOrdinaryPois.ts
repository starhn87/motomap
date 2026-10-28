import { providerLocationAllowed, withCoordinateUse } from '@/stores/useLocationPrivacyStore';
import { ProviderError, providerHttpError, rememberProviderFailure, requireProviderAvailable } from '@/lib/providerErrors';
import { insidePoiBounds, validPoiBounds, type GuidePoi, type PoiBounds } from '@/lib/guidePoiCatalog';

// 일반 장소는 추천 등록 장소와 구분해 중립 아이콘으로 표시한다. 전체 카탈로그가 아닌 상위 결과다.
export const GUIDE_ORDINARY_CATEGORIES=['CE7','FD6','CS2','PK6','OL7','AT4'] as const;
const REST_KEY=process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

// 공급자 결과를 디스크/서버/영역 캐시에 저장하지 않는다. 현재 화면에 표시할 응답만 반환한다.
export async function fetchGuideOrdinaryPois(bounds:PoiBounds,signal:AbortSignal,focus?:{latitude:number;longitude:number}):Promise<{pois:GuidePoi[];partial:boolean}> {
  if(!validPoiBounds(bounds))throw new ProviderError('kakao-local','search','invalid_request');
  if(!providerLocationAllowed('kakao') || signal.aborted)throw new ProviderError('kakao-local','search','cancelled');
  const center=focus && insidePoiBounds(focus,bounds)?focus:{latitude:(bounds.south+bounds.north)/2,longitude:(bounds.west+bounds.east)/2};
  // 축소/3D의 먼 모서리 때문에 전체 조회를 건너뛰지 않고 중심 주변 약3km 안으로 제한한다.
  const halfLat=3000/Math.SQRT2/111_320,halfLng=halfLat/Math.max(0.1,Math.cos(center.latitude*Math.PI/180));
  const searchBounds={south:Math.max(bounds.south,center.latitude-halfLat),north:Math.min(bounds.north,center.latitude+halfLat),
    west:Math.max(bounds.west,center.longitude-halfLng),east:Math.min(bounds.east,center.longitude+halfLng)};
  if(!REST_KEY)throw new ProviderError('kakao-local','search','configuration');
  const controller=new AbortController(),abort=()=>controller.abort();
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  const timer=setTimeout(abort,8000);
  const pois:GuidePoi[]=[];let cursor=0,partial=false;
  async function worker() {
    while(cursor<GUIDE_ORDINARY_CATEGORIES.length && !controller.signal.aborted) {
      const category=GUIDE_ORDINARY_CATEGORIES[cursor++];
      try {
        requireProviderAvailable('kakao-local');
        const params=new URLSearchParams({category_group_code:category,rect:[searchBounds.west,searchBounds.south,searchBounds.east,searchBounds.north].join(','),
          x:String(center.longitude),y:String(center.latitude),sort:'distance',size:'15',page:'1'});
        const response=await withCoordinateUse(center,'search','kakao',()=>fetch(`https://dapi.kakao.com/v2/local/search/category.json?${params}`,{
          headers:{Authorization:`KakaoAK ${REST_KEY}`},signal:controller.signal,
        }));
        if(!response.ok)throw providerHttpError('kakao-local','search',response.status);
        const data=await response.json();
        if(!Array.isArray(data?.documents) || data.documents.length>15 || typeof data?.meta?.is_end!=='boolean')
          throw new ProviderError('kakao-local','search','invalid_response');
        const rows:GuidePoi[]=[];
        for(const row of data.documents) {
          if(!row || typeof row.id!=='string' || !row.id || row.id.length>100 || typeof row.place_name!=='string' || !row.place_name.trim() ||
            typeof row.x!=='string' || !row.x.trim() || typeof row.y!=='string' || !row.y.trim() ||
            !Number.isFinite(Number(row.x)) || !Number.isFinite(Number(row.y)) ||
            (row.address_name!=null && typeof row.address_name!=='string') || (row.road_address_name!=null && typeof row.road_address_name!=='string'))
            throw new ProviderError('kakao-local','search','invalid_response');
          const point={latitude:Number(row.y),longitude:Number(row.x)};
          if(!insidePoiBounds(point,searchBounds))continue;
          rows.push({...point,key:`kakao:${row.id}`,providerId:row.id,name:row.place_name.trim().slice(0,200),address:row.road_address_name||row.address_name||''});
        }
        pois.push(...rows);
      } catch(error) {
        if(signal.aborted)throw new ProviderError('kakao-local','search','cancelled');
        partial=true;
        const failure=error instanceof ProviderError?error:new ProviderError('kakao-local','search',controller.signal.aborted?'timeout':'offline');
        rememberProviderFailure(failure);
        if(failure.kind==='configuration' || failure.kind==='rate_limited')controller.abort();
      }
    }
  }
  try {
    // 한 화면당 최대6회, 동시에3회. 페이지를 모두 긁거나 영역을 분할 수집하지 않는다.
    await Promise.all([worker(),worker(),worker()]);
    if(signal.aborted || !providerLocationAllowed('kakao'))throw new ProviderError('kakao-local','search','cancelled');
    return {pois,partial:partial||controller.signal.aborted};
  } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

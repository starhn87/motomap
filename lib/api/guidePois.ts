import { supabase } from '@/lib/supabase';
import { withCoordinateUse } from '@/stores/useLocationPrivacyStore';
import type { Database } from '@/lib/database.types';
import { validPoiBounds, type GuidePoi, type PoiBounds } from '@/lib/guidePoiCatalog';
import type { PlaceCategory } from '@/types';

type MapRow = Database['public']['Functions']['guide_places_in_viewport']['Returns'][number];
type FavoriteRow = Database['public']['Functions']['guide_map_favorites']['Returns'][number];
const PAGE_SIZE=250;
const MAX_PAGES=40;
function rowPoint(row: MapRow | FavoriteRow): GuidePoi {
  const placeId='place_id' in row ? row.place_id : row.id;
  const generalPlaceId='general_place_id' in row ? row.general_place_id : undefined;
  return {key:placeId ? `place:${placeId}` : generalPlaceId ? `general:${generalPlaceId}` : `favorite:${row.id}`,
    name:row.name,address:row.address,latitude:row.latitude,longitude:row.longitude,
    category:(row.category??undefined) as PlaceCategory|undefined,placeId:placeId??undefined,
    generalPlaceId:generalPlaceId??undefined,
    providerId:row.source_provider==='kakao' ? row.source_place_id??undefined : undefined,
    ...('place_id' in row ? {favorite:true} : {})};
}
// 첫 페이지가 잘렸는데 전체를 읽었다고 취급하지 않는다. 상한이면 자체 POI 전환을 보류한다.
export async function collectGuidePoiPages<T extends {id:string}>(read:(after:string|undefined)=>Promise<T[]>,signal:AbortSignal):Promise<T[]> {
  const rows:T[]=[];let after:string|undefined;
  for(let page=0;page<MAX_PAGES;page++) {
    if(signal.aborted)throw new Error('aborted');
    const data=await read(after);if(signal.aborted)throw new Error('aborted');
    if(data.length>PAGE_SIZE+1 || data.some((row,index)=>!row.id || (after!==undefined && row.id<=after)
      || (index>0 && row.id<=data[index-1].id))) throw new Error('invalid_poi_page');
    rows.push(...data.slice(0,PAGE_SIZE));
    if(data.length<=PAGE_SIZE)return rows;
    const cursor=data[PAGE_SIZE-1].id;
    if(cursor===after)throw new Error('invalid_poi_cursor');
    after=cursor;
  }
  throw new Error('incomplete_poi_results');
}
export async function fetchGuidePlaces(bounds:PoiBounds,signal:AbortSignal):Promise<GuidePoi[]> {
  if(!validPoiBounds(bounds))throw new Error('invalid_poi_bounds');
  return withCoordinateUse({latitude:(bounds.south+bounds.north)/2,longitude:(bounds.west+bounds.east)/2},'search','motomap',async()=>{
    const rows=await collectGuidePoiPages<MapRow>(async after=>{
      const {data,error}=await supabase.rpc('guide_places_in_viewport',{p_south:bounds.south,p_west:bounds.west,
        p_north:bounds.north,p_east:bounds.east,p_after_id:after,p_limit:PAGE_SIZE+1}).abortSignal(signal);
      if(error)throw error;return data??[];
    },signal);
    return rows.map(rowPoint);
  });
}
export async function fetchGuideFavorites(signal:AbortSignal):Promise<GuidePoi[]> {
  const rows=await collectGuidePoiPages<FavoriteRow>(async after=>{
    const {data,error}=await supabase.rpc('guide_map_favorites',{p_after_id:after,p_limit:PAGE_SIZE+1}).abortSignal(signal);
    if(error)throw error;return data??[];
  },signal);
  return rows.map(rowPoint);
}

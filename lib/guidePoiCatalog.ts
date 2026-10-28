import type { PlaceCategory } from '../types';

export interface PoiBounds { south: number; west: number; north: number; east: number }
export interface GuidePoi {
  key: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  category?: PlaceCategory;
  placeId?: string;
  generalPlaceId?: string;
  providerId?: string;
  favorite?: boolean;
  personal?: 'home' | 'work';
  brand?: string;
  price?: number;
  gasId?: string;
}
export function validPoiBounds(b: PoiBounds): boolean {
  return Object.values(b).every(Number.isFinite) && b.south >= -90 && b.north <= 90 && b.west >= -180 && b.east <= 180
    && b.north > b.south && b.east > b.west && b.north - b.south <= 2 && b.east - b.west <= 2;
}
export function insidePoiBounds(p: { latitude: number; longitude: number }, b: PoiBounds) {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude >= b.south && p.latitude <= b.north
    && p.longitude >= b.west && p.longitude <= b.east;
}
export function containsPoiBounds(outer: PoiBounds, inner: PoiBounds) {
  return outer.south <= inner.south && outer.west <= inner.west && outer.north >= inner.north && outer.east >= inner.east;
}
export function paddedPoiBounds(b: PoiBounds): PoiBounds {
  const lat=(b.north-b.south)*0.25, lng=(b.east-b.west)*0.25;
  return { south:Math.max(-90,b.south-lat), north:Math.min(90,b.north+lat), west:Math.max(-180,b.west-lng), east:Math.min(180,b.east+lng) };
}
export const poiPriority = (p: GuidePoi) => p.personal ? 0 : p.favorite ? 1 : p.gasId ? 2 : p.placeId ? 3 : 4;

// 같은 ID만 통합한다. 가깝다는 이유로 다른 점포의 가격이나 등록 ID를 옮기지 않는다.
export function mergeGuidePois(rows: GuidePoi[], bounds: PoiBounds): GuidePoi[] {
  const result: GuidePoi[]=[];
  const ids=new Map<string,number>();
  const ambiguous=new Set<string>();
  const providerPlaces=new Map<string,Set<string>>();
  for(const row of rows) if(row.providerId && row.placeId) {
    const places=providerPlaces.get(row.providerId)??new Set<string>();places.add(row.placeId);
    providerPlaces.set(row.providerId,places);
    if(places.size>1)ambiguous.add(`kakao:${row.providerId}`);
  }
  for (const row of rows) {
    if (!row.name.trim() || !insidePoiBounds(row,bounds)) continue;
    const identities=[row.key,...(row.placeId ? [`place:${row.placeId}`] : []),
      ...(row.generalPlaceId ? [`general:${row.generalPlaceId}`] : []),...(row.providerId ? [`kakao:${row.providerId}`] : [])];
    let index=identities.filter(id=>!ambiguous.has(id)).map(id=>ids.get(id)).find(index=>index!==undefined);
    if(index!==undefined && row.placeId && result[index].placeId && row.placeId!==result[index].placeId) {
      // 서로 다른 등록 ID가 같은 외부 ID를 주장하면 어느 쪽에도 일반 장소 ID를 붙이지 않는다.
      for(const id of identities) if(ids.get(id)===index){ambiguous.add(id);ids.delete(id);}
      index=undefined;
    }
    if (index===undefined) {
      identities.filter(id=>!ambiguous.has(id)).forEach(id=>ids.set(id,result.length));result.push({...row});
    } else {
      const old=result[index];
      // 등록 장소 식별은 검증된 등록 행에서만, 가격은 같은 주유소 ID에서만 합친다.
      result[index]={...old,...(row.placeId ? row : {}),favorite:old.favorite||row.favorite,
        personal:old.personal??row.personal,generalPlaceId:old.generalPlaceId??row.generalPlaceId};
      identities.filter(id=>!ambiguous.has(id)).forEach(id=>ids.set(id,index));
    }
  }
  return result.sort((a,b)=>poiPriority(a)-poiPriority(b));
}

// 세션 범위의 작은 메모리 캐시. 수신할 때 원본 만료를 다시 시작하지 않는다.
export class GuidePoiRegionCache<T> {
  private entries: { bounds:PoiBounds; value:T; expiresAt:number }[]=[];
  get(bounds: PoiBounds, now=Date.now()): {value:T;expiresAt:number} | undefined {
    this.entries=this.entries.filter(e=>e.expiresAt>now);
    return this.entries.find(e=>containsPoiBounds(e.bounds,bounds));
  }
  set(bounds:PoiBounds,value:T,expiresAt:number) {
    this.entries=[{bounds:{...bounds},value,expiresAt},...this.entries].slice(0,8);
  }
  clear() { this.entries=[]; }
}

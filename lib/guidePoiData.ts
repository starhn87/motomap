import { haversine } from './distance';
import { GuidePoiRegionCache, mergeGuidePois, paddedPoiBounds, validPoiBounds, type GuidePoi, type PoiBounds } from './guidePoiCatalog';
import type { GasStationSnapshot } from './api/gasStations';
import type { MyPlace, MyPlaceSlot } from '../stores/useMyPlacesStore';

interface Dependencies {
  places:(bounds:PoiBounds,signal:AbortSignal)=>Promise<GuidePoi[]>;
  favorites:(signal:AbortSignal)=>Promise<GuidePoi[]>;
  gas:(center:{latitude:number;longitude:number},signal:AbortSignal)=>Promise<GasStationSnapshot>;
  personal:()=>Promise<Partial<Record<MyPlaceSlot,MyPlace>>>;
  now?:()=>number;
}
const PLACE_TTL=5*60_000;
export class GuidePoiData {
  private places=new GuidePoiRegionCache<GuidePoi[]>();
  private gas=new GuidePoiRegionCache<GasStationSnapshot>();
  private favorites:{rows:GuidePoi[];expiresAt:number}|null=null;
  private favoriteRevision=0;
  constructor(private deps:Dependencies) {}
  invalidateFavorites() {this.favoriteRevision++;this.favorites=null;}
  clear() {this.places.clear();this.gas.clear();this.invalidateFavorites();}
  async load(bounds:PoiBounds,signedIn:boolean,gasAllowed:boolean,signal:AbortSignal) {
    if(!validPoiBounds(bounds))throw new Error('invalid_poi_bounds');
    const now=()=>this.deps.now?.()??Date.now();
    const padded=paddedPoiBounds(bounds);
    const queryBounds=validPoiBounds(padded)?padded:bounds;
    let registered=this.places.get(bounds,now());
    if(!registered) {
      const rows=await this.deps.places(queryBounds,signal);if(signal.aborted)throw new Error('aborted');
      registered={value:rows,expiresAt:now()+PLACE_TTL};this.places.set(queryBounds,rows,registered.expiresAt);
    }
    if(signedIn && (!this.favorites || this.favorites.expiresAt<=now())) {
      const revision=this.favoriteRevision;
      const rows=await this.deps.favorites(signal);if(signal.aborted)throw new Error('aborted');
      if(revision!==this.favoriteRevision)throw new Error('stale_favorites');
      this.favorites={rows,expiresAt:now()+PLACE_TTL};
    }
    const personal=await this.deps.personal();if(signal.aborted)throw new Error('aborted');
    let expiresAt=Math.min(registered.expiresAt,signedIn?this.favorites!.expiresAt:Infinity);
    const rows:GuidePoi[]=[...registered.value,...(signedIn?this.favorites!.rows:[])];
    for(const slot of ['home','work'] as const) {
      const place=personal[slot];
      // 집·회사는 canonical ID가 없어 같은 건물의 등록 장소로 흡수하지 않는다.
      if(place) rows.push({...place,key:`personal:${slot}`,personal:slot});
    }
    if(gasAllowed) {
      const center={latitude:(bounds.south+bounds.north)/2,longitude:(bounds.west+bounds.east)/2};
      const radius=Math.max(...[bounds.south,bounds.north].flatMap(latitude=>[bounds.west,bounds.east].map(longitude=>haversine(center,{latitude,longitude}))));
      // 넓은 개요를 여러 외부 조회로 채우지 않는다. 등록·저장 장소는 계속 표시한다.
      if(radius<=4500) {
        let gas=this.gas.get(bounds,now());
        try {
          if(!gas) {
            const snapshot=await this.deps.gas(center,signal);if(signal.aborted)throw new Error('aborted');
            const lat=3000/111_320,lng=lat/Math.max(0.1,Math.cos(center.latitude*Math.PI/180));
            const coverage={south:center.latitude-lat,north:center.latitude+lat,west:center.longitude-lng,east:center.longitude+lng};
            gas={value:snapshot,expiresAt:Math.min(snapshot.expiresAt,snapshot.fetchedAt+3600_000)};
            this.gas.set(coverage,snapshot,gas.expiresAt);
          }
          if(gas.expiresAt<=now())throw new Error('expired_gas_snapshot');
          expiresAt=Math.min(expiresAt,gas.expiresAt);
          for(const station of gas.value.stations) {
            if(station.brand==='ex알뜰' || station.name.includes('휴게소'))continue;
            rows.push({key:`gas:${station.id}`,name:station.name,latitude:station.latitude,longitude:station.longitude,
              category:'gas_station',gasId:station.id,brand:station.brand,...(station.price>0?{price:station.price}:{})});
          }
        } catch(error) {if(signal.aborted)throw new Error('aborted');expiresAt=Math.min(expiresAt,now()+30_000);}
      }
    }
    if(signal.aborted)throw new Error('aborted');
    return {pois:mergeGuidePois(rows,bounds),expiresAt};
  }
}

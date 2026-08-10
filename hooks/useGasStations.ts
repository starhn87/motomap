import { useQuery } from '@tanstack/react-query';

import {
  fetchNearbyGasStations,
  fetchGasStationDetail,
  fetchGasPricesAt,
  looksLikeGasStation,
  type FuelCode,
  type GasStation,
} from '@/lib/api/gasStations';

export interface SearchPoint {
  latitude: number;
  longitude: number;
}

/** 검색 스냅샷 — 재검색 시점의 지도 중심·줌·화면 크기. 여기서 커버 영역이 계산된다. */
export interface GasSearchSpec extends SearchPoint {
  zoom: number;
  widthDp: number;
  heightDp: number;
}

// 웹 머카토르: 이 줌에서 1dp 가 몇 미터인가
function metersPerDp(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

// 오피넷은 반경 최대 5km 의 지점 검색뿐이다 — 네이버 지도처럼 "화면에 보이는
// 영역"을 채우려면 뷰포트가 5km 를 넘을 때 5km 원들로 격자 타일링해야 한다.
// 간격 7km(≈5√2)면 원들이 평면을 빈틈없이 덮는다. 축 3지점(총 9콜)까지만 —
// 그 이상 축소된 지도는 중앙 ~26km 만 커버한다(전국 뷰를 채울 방법은 없다).
const TILE_SPACING_M = 7000;
const MAX_TILES_PER_AXIS = 3;

function buildSearchPlan(spec: GasSearchSpec): { points: SearchPoint[]; radius: number } {
  const mpd = metersPerDp(spec.latitude, spec.zoom);
  const halfW = (spec.widthDp / 2) * mpd;
  const halfH = (spec.heightDp / 2) * mpd;
  const halfDiag = Math.hypot(halfW, halfH);
  if (halfDiag <= 5000) {
    // 화면이 한 원 안 — 반경도 화면에 맞춘다 (확대할수록 좁고 정확하게)
    return { points: [spec], radius: Math.min(5000, Math.max(1000, Math.round(halfDiag))) };
  }
  const nx = Math.min(MAX_TILES_PER_AXIS, Math.ceil((halfW * 2) / TILE_SPACING_M));
  const ny = Math.min(MAX_TILES_PER_AXIS, Math.ceil((halfH * 2) / TILE_SPACING_M));
  const latPerM = 1 / 111000;
  const lngPerM = 1 / (111320 * Math.cos((spec.latitude * Math.PI) / 180));
  const points: SearchPoint[] = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const dx = (ix - (nx - 1) / 2) * TILE_SPACING_M;
      const dy = (iy - (ny - 1) / 2) * TILE_SPACING_M;
      points.push({
        latitude: spec.latitude + dy * latPerM,
        longitude: spec.longitude + dx * lngPerM,
      });
    }
  }
  return { points, radius: 5000 };
}

// 수동 갱신 모델 — 지도 이동에 연동하지 않고, 필터 진입 시 1회 + "현 지도에서 재검색" 버튼으로만
// 스냅샷이 바뀐다. 기준점이 고정되니 최저가 표시도 재검색 전까지 흔들리지 않는다.
export function useGasStations(spec: GasSearchSpec | null, enabled: boolean, prod: FuelCode = 'B027') {
  return useQuery({
    queryKey: [
      'gas-stations',
      spec?.latitude.toFixed(3),
      spec?.longitude.toFixed(3),
      spec ? Math.round(spec.zoom * 2) : null,
      prod,
    ],
    queryFn: async () => {
      const { points, radius } = buildSearchPlan(spec!);
      const results = await Promise.all(
        points.map((p) =>
          fetchNearbyGasStations({ latitude: p.latitude, longitude: p.longitude, radius, prod })
            // 타일 일부가 실패해도 나머지로 그린다 (단일 지점이면 아래 throw 로 에러 전파)
            .catch(() => null),
        ),
      );
      if (results.every((r) => r === null)) throw new Error('주유소 정보를 불러오지 못했습니다');
      // 타일 경계가 겹치므로 id 로 중복 제거. 거리도 호출 지점 기준이라 지도 중심
      // 기준으로 다시 계산해 "최저가 동가 중 최근접" 판정이 일관되게 한다.
      const byId = new Map<string, GasStation>();
      for (const list of results) {
        for (const s of list ?? []) {
          if (!byId.has(s.id)) byId.set(s.id, s);
        }
      }
      return [...byId.values()]
        .map((s) => ({
          ...s,
          distance: Math.hypot(
            (s.latitude - spec!.latitude) * 111000,
            (s.longitude - spec!.longitude) * 88000,
          ),
        }))
        .sort((a, b) => a.price - b.price || a.distance - b.distance);
    },
    enabled: enabled && !!spec,
    staleTime: 3 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useGasStationDetail(id: string | null) {
  return useQuery({
    queryKey: ['gas-station', id],
    queryFn: () => fetchGasStationDetail(id!),
    enabled: !!id,
    staleTime: 3 * 60 * 1000,
  });
}

// 일반 장소 카드에 유가를 얹기 위한 조회 — 주유소로 보이는 이름일 때만 나간다.
export function useGasPricesAt(
  place: { name: string; latitude: number; longitude: number } | null,
) {
  return useQuery({
    queryKey: ['gas-at', place?.latitude, place?.longitude, place?.name],
    queryFn: () => fetchGasPricesAt(place!),
    enabled: !!place && looksLikeGasStation(place.name),
    staleTime: 3 * 60 * 1000,
  });
}

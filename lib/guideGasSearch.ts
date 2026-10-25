import { mergedGasExpiry, type GasCacheMetadata } from '@/lib/gasCache';
import { fetchNearbyGasStationsSnapshot, type FuelCode, type GasStation } from '@/lib/api/gasStations';
import { haversine } from '@/lib/distance';

type Center = { latitude: number; longitude: number };
export const GUIDE_GAS_RADII = [5000, 10000, 15000, 20000, 25000, 30000] as const;

// 오피넷의 1회 조회 한도는 5km다. 삼각 격자의 원들을 겹쳐 원래 중심의
// 검색 원 전체를 덮는다. 좌표 변환·프록시 캐시의 오차를 위한 여유를 둔다.
export function gasSearchTiles(center: Center, radius: number) {
  const tiles: (Center & { key: string; distance: number })[] = [];
  const spacing = 7200, rowHeight = spacing * Math.sqrt(3) / 2;
  for (let row = -6; row <= 6; row++) for (let column = -6; column <= 6; column++) {
    const east = spacing * (column + (Math.abs(row) % 2) / 2), north = row * rowHeight;
    const distance = Math.hypot(east, north);
    if (distance > radius + 5000) continue;
    tiles.push({ key: `${row}:${column}`, distance,
      latitude: center.latitude + north / 6371000 * 180 / Math.PI,
      longitude: center.longitude + east / (6371000 * Math.cos(center.latitude * Math.PI / 180)) * 180 / Math.PI });
  }
  return tiles.sort((a, b) => a.distance - b.distance);
}

export async function searchGuideGasStations(center: Center & { prod: FuelCode }, options: {
  signal: AbortSignal;
  valid: () => boolean;
  progress: (radius: number, found: number) => Promise<void>;
}) {
  const snapshots: GasCacheMetadata[] = [];
  const queried = new Set<string>(), stations = new Map<string, GasStation>();
  let completedRadius = 0, attemptedRadius = 5000, failed = false;
  const results = (radius: number) => [...stations.values()].filter(s => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
  for (const radius of GUIDE_GAS_RADII) {
    attemptedRadius = radius;
    if (!options.valid()) throw new Error('location_disabled');
    if (options.signal.aborted) { failed = true; break; }
    await options.progress(radius, results(radius === 5000 ? radius : radius - 5000).length);
    const tiles = radius === 5000 ? [{ ...center, key: '0:0' }] : gasSearchTiles(center, radius);
    const pending = tiles.filter(tile => !queried.has(tile.key));
    for (let i = 0; i < pending.length; i += 3) {
      if (!options.valid()) throw new Error('location_disabled');
      if (options.signal.aborted) { failed = true; break; }
      const batch = await Promise.allSettled(pending.slice(i, i + 3).map(async tile => {
        const found = await fetchNearbyGasStationsSnapshot({ ...tile, prod: center.prod, radius: 5000, signal: options.signal, preciseCenter: true });
        queried.add(tile.key);
        return found;
      }));
      for (const result of batch) {
        if (result.status === 'rejected') { failed = true; continue; }
        snapshots.push(result.value);
        for (const station of result.value.stations) {
          const distance = haversine(center, station);
          if (station.price > 0 && distance <= 30000) stations.set(station.id, { ...station, distance });
        }
      }
      // 조회 실패를 '주변에 없음'으로 바꾸지 않는다. 확인한 가격만 부분 결과로 돌린다.
      if (failed) break;
    }
    if (!options.valid()) throw new Error('location_disabled');
    if (failed) break;
    completedRadius = radius;
    if (results(radius).length >= 5) break;
  }
  return { stations: results(attemptedRadius), radius: attemptedRadius,
    completedRadius, partial: failed, fetchedAt: Math.min(Date.now(), ...snapshots.map(snapshot => snapshot.fetchedAt)),
    expiresAt: mergedGasExpiry(snapshots, results(attemptedRadius).length > 0, failed) };
}

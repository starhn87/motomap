import KakaoNavi from '@/modules/kakao-navi';
import { fetchNearbyGasStationsSnapshot } from '@/lib/api/gasStations';
import { haversine } from '@/lib/distance';
import { providerLocationAllowed, useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';

let pending: { controller: AbortController; requestId: string } | null = null;
export function cancelGuideGasPrices() {
  pending?.controller.abort(); pending = null;
}

// 메뉴 검색과 분리한 일반휘발유 가격 전용 조회. 서버 원본 만료 시각을 연장하지 않는다.
export async function handleGuideGasPrices() {
  const context = await KakaoNavi.getGuideGasPriceContext();
  if (!context || pending?.requestId === context.requestId) return;
  cancelGuideGasPrices();
  const request = { requestId: context.requestId, controller: new AbortController() }; pending = request;
  const revision = useLocationPrivacyStore.getState().revision;
  const valid = () => pending === request && !request.controller.signal.aborted &&
    revision === useLocationPrivacyStore.getState().revision &&
    providerLocationAllowed('opinet') && providerLocationAllowed('kakao');
  const timeout = setTimeout(() => request.controller.abort(), 18_000);
  try {
    if (!valid()) throw new Error('location_disabled');
    const snapshot = await fetchNearbyGasStationsSnapshot({ ...context, prod: 'B027', radius: 5000, signal: request.controller.signal });
    if (!valid()) return;
    const stations = snapshot.stations.filter(station => station.price > 0 && haversine(context, station) <= 5000)
      .sort((a,b) => haversine(context,a)-haversine(context,b)).slice(0,24);
    await KakaoNavi.updateGuideGasPriceMarkers(JSON.stringify({ requestId: context.requestId, stations,
      fetchedAt: snapshot.fetchedAt, expiresAt: snapshot.expiresAt }));
  } catch {
    if (pending === request) await KakaoNavi.updateGuideGasPriceMarkers(JSON.stringify({ requestId: context.requestId, error:'unavailable' })).catch(() => {});
  } finally { clearTimeout(timeout); if (pending === request) pending = null; }
}

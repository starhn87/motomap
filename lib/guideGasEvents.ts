import { router } from 'expo-router';
import KakaoNavi, { supportsKakaoNaviFeature } from '@/modules/kakao-navi';
import { searchGuideGasStations } from '@/lib/guideGasSearch';
import { fetchNearbyGasStations } from '@/lib/api/gasStations';
import { haversine } from '@/lib/distance';
import { useGuideSession } from '@/lib/guideSession';
import { providerLocationAllowed, useLocationPrivacyStore, withLocationUse } from '@/stores/useLocationPrivacyStore';

const fetching = new Set<string>();
let gasRequest: AbortController | null = null;
let opening: { goal: unknown; revision: number } | null = null;

export async function handleGuideGasMenu(id: number) {
  if (id === 106) {
    const context = await KakaoNavi.getGuideGasContext();
    if (!context || fetching.has(context.requestId)) return;
    fetching.add(context.requestId);
    gasRequest?.abort();
    const controller = new AbortController(); gasRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 90_000);
    const goal = useGuideSession.getState().goal;
    const revision = useLocationPrivacyStore.getState().revision;
    const valid = () => gasRequest === controller && goal === useGuideSession.getState().goal && providerLocationAllowed('opinet') && revision === useLocationPrivacyStore.getState().revision;
    try {
      if (!valid()) throw new Error('location_disabled');
      const expanded = supportsKakaoNaviFeature('guide_gas_search_expansion');
      const result = expanded ? await searchGuideGasStations(context, { signal: controller.signal, valid,
        progress: async (progressRadius, foundCount) => {
          if (valid()) await KakaoNavi.updateGuideGasStations(JSON.stringify({ requestId: context.requestId, progressRadius, foundCount }));
        } }) : null;
      const stations = result?.stations ?? (await fetchNearbyGasStations({ ...context, radius: 5000 }))
        .filter(station => station.price > 0)
        .map(station => ({ ...station, distance: haversine(context, station) }))
        .filter(station => station.distance <= 5000)
        .sort((a,b) => a.distance-b.distance).slice(0,40);
      if (!valid()) throw new Error('location_disabled');
      await KakaoNavi.updateGuideGasStations(JSON.stringify({ requestId: context.requestId, stations, ...(result ? { radius: result.radius, partial: result.partial, completedRadius: result.completedRadius, fetchedAt: result.fetchedAt, expiresAt: result.expiresAt } : {}),
        canAddVia: !useGuideSession.getState().goal?.courseId && context.viaCount < 3,
        courseMode: !!useGuideSession.getState().goal?.courseId }));
    } catch {
      await KakaoNavi.updateGuideGasStations(JSON.stringify({ requestId: context.requestId, stations: [], error: 'unavailable' })).catch(() => {});
    } finally { clearTimeout(timeout); if (gasRequest === controller) gasRequest = null; fetching.delete(context.requestId); }
    return;
  }
  if (id !== 108) return;
  const original = useGuideSession.getState().goal;
  const revision = useLocationPrivacyStore.getState().revision;
  if (!original || (opening?.goal === original && opening.revision === revision)) return;
  const request = { goal: original, revision }; opening = request;
  const current = () => original === useGuideSession.getState().goal && revision === useLocationPrivacyStore.getState().revision;
  let handedOff = false;
  let token: number | undefined;
  try {
    const choice = await KakaoNavi.takeGuideGasSelection();
    if (!choice || !current() || !providerLocationAllowed('kakao') || !providerLocationAllowed('opinet')) return;
    await withLocationUse('navigation','kakao', async () => {
      if (!current() || !providerLocationAllowed('kakao') || !providerLocationAllowed('opinet')) return;
      const snapshot = await KakaoNavi.openGuidePreview(); token = snapshot.token;
      const session = useGuideSession.getState();
      if (session.goal !== original || revision !== useLocationPrivacyStore.getState().revision || !providerLocationAllowed('opinet')) {
        await KakaoNavi.returnToGuide(token); token = undefined; return;
      }
      if (choice.via && (original.courseId || snapshot.vias.length >= 3)) throw new Error('via_limit');
      const station = { name: choice.station.name, latitude: choice.station.latitude, longitude: choice.station.longitude };
      const proposed = choice.via
        ? { ...snapshot, vias: [station, ...snapshot.vias], gasViaAdded: true }
        : { ...snapshot, goal: station, goalReplaced: true, vias: original.courseId ? [] : snapshot.vias };
      session.setPreview({ snapshot: proposed, edit: null, returnPending: false });
      router.push({ pathname: '/navi', params: { resume: String(token) } }); token = undefined;
      handedOff = true;
      // 확인자료 후처리가 다음 미리보기 진입을 잠그지 않게 한다.
      if (opening === request) opening = null;
    });
  } catch (error) {
    if (token !== undefined) {
      useGuideSession.getState().setPreview(null);
      await KakaoNavi.returnToGuide(token).catch(() => false);
    }
    if (handedOff || !current()) return;
    await KakaoNavi.showGuideToast(error instanceof Error && error.message === 'via_limit'
      ? '경유지는 최대 3개까지 추가할 수 있어요. 코스 안내의 경유지는 고정돼 있어요.'
      : '경로 미리보기를 열지 못했어요. 다시 시도해 주세요.').catch(() => {});
  } finally { if (opening === request) opening = null; }
}

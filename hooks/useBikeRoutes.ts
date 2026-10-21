import { withLocationUse, providerLocationAllowed, useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { useEffect, useState } from 'react';

import KakaoNavi, {
  friendlyRouteError,
  ROUTE_PRIORITIES,
  pairsFromFlat,
  routeErrorCode,
  type BikeRoute,
  type RoutePriority,
} from '@/modules/kakao-navi';
import { sampleWaypoints, type NavTarget } from '@/lib/navigation';
import { ensureKakaoNaviReady } from '@/lib/kakaoNaviInit';
import { fetchBikeTraffic, type TrafficPart } from '@/lib/api/directions';
import { toast } from '@/lib/toast';
import { track } from '@/lib/analytics';
import { canFallbackToCourseStart, kakaoNaviProviderError, shouldReduceRouteVias } from '@/lib/kakaoRouteErrors';
import { rememberProviderFailure } from '@/lib/providerErrors';

const ROUTE_LOAD_TIMEOUT_MS = 20_000;

type RouteOption = { route: BikeRoute; vias: number[]; context: string };
type RouteFailure = { message: string; canRetry: boolean; context: string };

// 미리보기 화면의 "지점 → 경로" 도메인 — 옵션별 경로·혼잡 캐시, 20412 경유지
// 축소 사다리, 원거리 코스의 출발지 폴백까지 여기가 맡는다. 화면은 지점 편집과
// 안내 시작만 다루고, 경로가 어떻게 확보되는지는 모른다.
export function useBikeRoutes(args: {
  /** [lng, lat] — 지정 출발지 또는 현재 위치. null 이면 아직 확보 전 */
  start: [number, number] | null;
  /** 지정 출발지 이름 — 계측(has_custom_start)에만 쓴다 */
  startName: string | null;
  goal: NavTarget;
  /** 길찾기 경유지(편집 가능) — null 은 아직 안 채운 빈 줄 */
  userVias: (NavTarget | null)[];
  /** 코스 안내의 경유지 [lng,lat,...] — 지오메트리라 편집 대상이 아니다 */
  courseVias: number[];
  isCourseMode: boolean;
  /** 화면이 가려지거나 안내 시작 중이면 비교 요청을 중지한다. */
  enabled?: boolean;
}) {
  const privacyRevision = useLocationPrivacyStore((s) => s.revision);
  const { start, startName, goal, userVias, courseVias, isCourseMode, enabled = true } = args;

  const [priority, setPriority] = useState<RoutePriority>(0);
  const [routes, setRoutes] = useState<Partial<Record<RoutePriority, RouteOption>>>({});
  // 옵션별 혼잡 구간(경로선 색칠용). 없으면 SDK 선형을 단색으로 그린다.
  const [traffic, setTraffic] = useState<Partial<Record<RoutePriority, { parts: TrafficPart[]; context: string }>>>({});
  const [errors, setErrors] = useState<Partial<Record<RoutePriority, RouteFailure>>>({});
  // 현재 위치에서 도로가 이어지지 않는 원거리 코스(예: 육지→제주)는
  // 코스 출발지 기준 미리보기로 폴백한다. 이때 안내 시작은 막는다.
  const [courseOnly, setCourseOnly] = useState(false);

  const flatVias = isCourseMode
    ? courseVias
    : userVias.flatMap((p) => (p ? [p.longitude, p.latitude] : []));
  // 폴백 시: 첫 경유지(코스 출발지)가 출발점이 되고 나머지가 경유지로 남는다
  const effStart: [number, number] | null = courseOnly
    ? [flatVias[0], flatVias[1]]
    : start;
  const effVias = courseOnly ? flatVias.slice(2) : flatVias;
  // 비교하는 옵션이 같은 입력에서 나온 것인지도 확인한다. 입력 변경 직후의
  // 렌더에서도 이전 좌표·동의 상태의 경로를 안내 시작에 사용하지 않는다.
  const context = JSON.stringify([effStart, goal.longitude, goal.latitude, effVias, privacyRevision]);
  const allowed = providerLocationAllowed('kakao');
  const option = allowed && routes[priority]?.context === context ? routes[priority] : undefined;
  const route = option?.route;
  const activeVias = option?.vias ?? null;
  const failure = errors[priority]?.context === context ? errors[priority] : undefined;
  const routeError = !allowed
    ? '위치정보 설정에서 현재 위치 이용과 카카오 위치 전달을 선택해 주세요.'
    : failure?.message ?? null;
  const canRetryRoute = allowed && (failure?.canRetry ?? true);
  const loading = allowed && !route && !routeError;
  const hasFailure = Object.values(errors).some((error) => error?.context === context);
  // 선택 경로를 먼저 받고 나머지 옵션은 하나씩 받는다. 실패 뒤에는 자동 비교
  // 요청을 멈추고 사용자가 옵션을 선택하거나 다시 시도할 때만 재개한다.
  const requestPriority = !route && !failure ? priority : route && !hasFailure
    ? ROUTE_PRIORITIES.find((p) => routes[p.value]?.context !== context)?.value
    : undefined;

  // 지점이 바뀌면 옵션별 캐시가 전부 낡는다 — 경로·혼잡도를 비워 재조회를 태운다
  const resetRoutes = () => {
    setRoutes({});
    setTraffic({});
    setErrors({});
    setCourseOnly(false);
  };

  const retryRoute = () => {
    if (!canRetryRoute) return;
    setErrors((previous) => ({ ...previous, [priority]: undefined }));
    setRoutes((previous) => ({ ...previous, [priority]: undefined }));
    setTraffic((previous) => ({ ...previous, [priority]: undefined }));
  };

  // 선택 경로 우선, 이후 비교 옵션을 순차 확보한다(옵션별 경로·경유지 캐시).
  // 20412 는 경유지 좌표가 도로에 스냅되지 않는 경우라, 경유지를
  // [전체 → 코스 출발지만 → 없음] 순으로 줄여가며 재시도한다.
  useEffect(() => {
    if (!allowed) {
      if (Object.keys(routes).length) setRoutes({});
      return;
    }
    if (!enabled || !effStart || requestPriority === undefined) return;
    const requestedPriority = requestPriority;
    const fail = (message: string, canRetry: boolean) => {
      setErrors((previous) => ({ ...previous, [requestedPriority]: { message, canRetry, context } }));
    };
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      fail('길안내 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.', true);
    }, ROUTE_LOAD_TIMEOUT_MS);

    (async () => {
      // SDK 는 여기서 처음 초기화된다(lazy — 배터리 사유는 lib/kakaoNaviInit.ts)
      try {
        await ensureKakaoNaviReady();
      } catch (err) {
        if (!cancelled) {
          const failure = kakaoNaviProviderError(err, 'initialize');
          fail(friendlyRouteError(failure), failure.kind !== 'configuration');
        }
        return;
      }
      if (cancelled) return;
      const requestVias = effVias;
      // 실패 시 경유지를 줄여가며 재시도하는 사다리 — 축소는 사전 추림(20개)과
      // 같은 샘플러를 쓴다. 20413(도로 자체가 안 이어짐)은 경유지를 줄여도
      // 소용없으니 바로 중단한다.
      const viaPairs = pairsFromFlat(requestVias);
      const ladder = [viaPairs.length, 12, 5, 1, 0]
        .filter((n, i, arr) => n <= viaPairs.length && arr.indexOf(n) === i)
        .map((n) => (n === 0 ? [] : sampleWaypoints(viaPairs, n).flat()));

      let lastErr: unknown = null;
      for (const tryVias of ladder) {
        try {
          const result = await withLocationUse('route','kakao',() => KakaoNavi.requestBikeRoute(
            effStart[0], effStart[1], goal.longitude, goal.latitude, tryVias, requestedPriority,
          ));
          if (cancelled) return;
          if (tryVias.length < requestVias.length) {
            if (requestedPriority === priority) toast.info('일부 경유지를 빼고 안내해요', '경로가 코스와 다를 수 있어요.');
          }
          setRoutes((prev) => ({ ...prev, [requestedPriority]: { route: result, vias: tryVias, context } }));
          if (requestedPriority === priority) track.navigationPreviewed({
            distance_m: result.distance,
            duration_s: result.duration,
            priority: requestedPriority,
            via_count: pairsFromFlat(tryVias).length,
            has_custom_start: !!startName,
          });
          return;
        } catch (err) {
          if (cancelled) return;
          const failure = kakaoNaviProviderError(err, 'route');
          lastErr = failure;
          rememberProviderFailure(failure);
          // 경유지 단절만 사다리로 해결한다. 인증·네트워크·서버 실패에는 같은 요청을 반복하지 않는다.
          if (!shouldReduceRouteVias(lastErr)) break;
        }
      }
      if (cancelled) return;

      // 현재 위치 출발이 막힌 코스 안내는 코스 출발지 기준으로 재시도
      if (!courseOnly && isCourseMode && !Object.values(routes).some((entry) => entry?.context === context) && flatVias.length >= 2 && canFallbackToCourseStart(lastErr)) {
        setRoutes({});
        setTraffic({});
        setCourseOnly(true);
        toast.info('코스 출발지 기준으로 보여드려요', '현재 위치에서 이어지는 도로가 없어요.');
        return;
      }
      // 병렬로 받아둔 혼잡도 선만 남으면 "경로 없음"과 어긋난다 — 함께 지운다
      setTraffic((prev) => ({ ...prev, [requestedPriority]: undefined }));
      track.routeFailed({
        code: routeErrorCode(lastErr),
        via_count: pairsFromFlat(requestVias).length,
      });
      const failure = kakaoNaviProviderError(lastErr, 'route');
      fail(friendlyRouteError(failure), failure.kind !== 'configuration');
    })().catch((err) => {
      // 샘플링·후처리 등 SDK 요청 바깥의 예외도 영구 스피너나 unhandled로 남기지 않는다.
      if (!cancelled) {
        const failure = kakaoNaviProviderError(err, 'route');
        rememberProviderFailure(failure);
        fail(friendlyRouteError(failure), failure.kind !== 'configuration');
      }
    }).finally(() => {
      clearTimeout(timeout);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias·userVias·courseOnly 에서 파생
  }, [context, allowed, enabled, requestPriority, routes, errors]);

  // 혼잡 구간 색칠 — 선택한 옵션의 실제 경유지가 확정된 뒤에만 조회한다.
  // 비교용 경로에는 REST 혼잡 요청을 추가하지 않는다. 실패하면 단색 그대로다.
  useEffect(() => {
    if (!providerLocationAllowed('kakao')) {
      if (Object.keys(traffic).length) setTraffic({});
      return;
    }
    if (!enabled || !effStart || traffic[priority]?.context === context) return;
    if (!route) return;
    let cancelled = false;
    fetchBikeTraffic(effStart, [goal.longitude, goal.latitude], pairsFromFlat(activeVias ?? effVias), priority)
      .then((parts) => {
        if (!cancelled) setTraffic((prev) => ({ ...prev, [priority]: { parts, context } }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias·userVias·courseOnly 에서 파생
  }, [context, route, priority, enabled]);

  return {
    priority,
    setPriority,
    /** 선택된 옵션의 경로 — 없으면 로딩 중이거나 실패 */
    route,
    /** 같은 입력에서 계산한 비교용 옵션. 실제 사용한 경유지를 함께 보존한다. */
    alternatives: ROUTE_PRIORITIES.map((p) => ({
      ...p,
      route: allowed && routes[p.value]?.context === context ? routes[p.value]?.route : undefined,
      vias: allowed && routes[p.value]?.context === context ? routes[p.value]?.vias : undefined,
      error: errors[p.value]?.context === context ? errors[p.value]?.message : undefined,
      loading: allowed && enabled && requestPriority === p.value && !!effStart,
    })),
    /** 선택된 옵션의 혼잡 구간 — 없으면 단색으로 그린다 */
    trafficParts: allowed && traffic[priority]?.context === context ? traffic[priority]?.parts : undefined,
    loading,
    routeError,
    retryRoute,
    canRetryRoute,
    courseOnly,
    activeVias,
    effStart,
    effVias,
    flatVias,
    resetRoutes,
  };
}

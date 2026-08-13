import { useEffect, useState } from 'react';

import KakaoNavi, {
  friendlyRouteError,
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
}) {
  const { start, startName, goal, userVias, courseVias, isCourseMode } = args;

  const [priority, setPriority] = useState<RoutePriority>(0);
  const [routes, setRoutes] = useState<Partial<Record<RoutePriority, BikeRoute>>>({});
  // 옵션별 혼잡 구간(경로선 색칠용). 없으면 SDK 선형을 단색으로 그린다.
  const [traffic, setTraffic] = useState<Partial<Record<RoutePriority, TrafficPart[]>>>({});
  const [loading, setLoading] = useState(true);
  // 현재 위치에서 도로가 이어지지 않는 원거리 코스(예: 육지→제주)는
  // 코스 출발지 기준 미리보기로 폴백한다. 이때 안내 시작은 막는다.
  const [courseOnly, setCourseOnly] = useState(false);
  // 20412(경유지가 도로와 안 이어짐)로 경유지를 줄여 성공한 경우의 경유지.
  // 안내 시작도 이 목록을 그대로 쓴다.
  const [activeVias, setActiveVias] = useState<number[] | null>(null);

  const flatVias = isCourseMode
    ? courseVias
    : userVias.flatMap((p) => (p ? [p.longitude, p.latitude] : []));
  // 폴백 시: 첫 경유지(코스 출발지)가 출발점이 되고 나머지가 경유지로 남는다
  const effStart: [number, number] | null = courseOnly
    ? [flatVias[0], flatVias[1]]
    : start;
  const effVias = courseOnly ? flatVias.slice(2) : flatVias;
  const route = routes[priority];

  // 지점이 바뀌면 옵션별 캐시가 전부 낡는다 — 경로·혼잡도를 비워 재조회를 태운다
  const resetRoutes = () => {
    setRoutes({});
    setTraffic({});
    setActiveVias(null);
  };

  // 선택된 옵션의 경로 확보 (옵션별 캐시).
  // 20412 는 경유지 좌표가 도로에 스냅되지 않는 경우라, 경유지를
  // [전체 → 코스 출발지만 → 없음] 순으로 줄여가며 재시도한다.
  useEffect(() => {
    if (!effStart || routes[priority]) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // SDK 는 여기서 처음 초기화된다(lazy — 배터리 사유는 lib/kakaoNaviInit.ts)
      try {
        await ensureKakaoNaviReady();
      } catch (err) {
        if (!cancelled) {
          toast.error('길안내를 준비할 수 없습니다', friendlyRouteError(err));
        }
        return;
      }
      const requestVias = activeVias ?? effVias;
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
          const result = await KakaoNavi.requestBikeRoute(
            effStart[0], effStart[1], goal.longitude, goal.latitude, tryVias, priority,
          );
          if (cancelled) return;
          if (tryVias.length < requestVias.length) {
            setActiveVias(tryVias);
            toast.info('일부 경유지를 빼고 안내해요', '경로가 코스와 다를 수 있어요.');
          }
          setRoutes((prev) => ({ ...prev, [priority]: result }));
          track.navigationPreviewed({
            distance_m: result.distance,
            duration_s: result.duration,
            priority,
            via_count: pairsFromFlat(tryVias).length,
            has_custom_start: !!startName,
          });
          return;
        } catch (err) {
          lastErr = err;
          if (routeErrorCode(err) === 20413) break;
        }
      }
      if (cancelled) return;

      // 현재 위치 출발이 막힌 코스 안내는 코스 출발지 기준으로 재시도
      if (!courseOnly && isCourseMode && flatVias.length >= 2) {
        setRoutes({});
        setTraffic({});
        setCourseOnly(true);
        toast.info('코스 출발지 기준으로 보여드려요', '현재 위치에서 이어지는 도로가 없어요.');
        return;
      }
      // 병렬로 받아둔 혼잡도 선만 남으면 "경로 없음"과 어긋난다 — 함께 지운다
      setTraffic((prev) => ({ ...prev, [priority]: undefined }));
      track.routeFailed({
        code: routeErrorCode(lastErr),
        via_count: pairsFromFlat(requestVias).length,
      });
      toast.error('경로를 찾을 수 없습니다', friendlyRouteError(lastErr));
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias·userVias·courseOnly 에서 파생
  }, [effStart?.[0], effStart?.[1], priority, routes, goal.longitude, goal.latitude, courseVias.join(','), userVias, courseOnly, activeVias]);

  // 혼잡 구간 색칠 — 같은 엔진인 REST 로 같은 조건을 조회한다. 경유지가 없으면
  // 입력이 이미 확정이라 SDK 경로 요청과 병렬로 바로 쏘고(색칠이 SDK 왕복만큼
  // 빨라진다), 경유지가 있으면 사다리가 경유지를 줄일 수 있어 경로 확정을
  // 기다린다. 경로 useEffect 안에서 부르면 setRoutes 가 deps(routes)를 바꿔
  // cleanup 이 돌고 응답이 cancelled 에 막혀 버려진다(실측). 실패하면 단색 그대로.
  useEffect(() => {
    if (!effStart || traffic[priority]) return;
    if (effVias.length > 0 && !route) return;
    let cancelled = false;
    fetchBikeTraffic(effStart, [goal.longitude, goal.latitude], pairsFromFlat(activeVias ?? effVias), priority)
      .then((parts) => {
        if (!cancelled) setTraffic((prev) => ({ ...prev, [priority]: parts }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias·userVias·courseOnly 에서 파생
  }, [effStart?.[0], effStart?.[1], route, priority, goal.longitude, goal.latitude, activeVias]);

  return {
    priority,
    setPriority,
    /** 선택된 옵션의 경로 — 없으면 로딩 중이거나 실패 */
    route,
    /** 선택된 옵션의 혼잡 구간 — 없으면 단색으로 그린다 */
    trafficParts: traffic[priority],
    loading,
    courseOnly,
    activeVias,
    effStart,
    effVias,
    flatVias,
    resetRoutes,
  };
}

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  NaverMapView,
  NaverMapPathOverlay,
  NaverMapMultiPathOverlay,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import KakaoNavi, {
  ROUTE_PRIORITIES,
  friendlyRouteError,
  latLngsFromFlat,
  pairsFromFlat,
  routeErrorCode,
  type BikeRoute,
  type RoutePriority,
} from '@/modules/kakao-navi';
import { sampleWaypoints, type NavTarget } from '@/lib/navigation';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { ensureKakaoNaviReady } from '@/lib/kakaoNaviInit';
import { useMapStore } from '@/stores/useMapStore';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  fetchBikeTraffic,
  formatMeters,
  formatSeconds,
  type TrafficPart,
} from '@/lib/api/directions';
import { toast } from '@/lib/toast';
import { useGuideSession } from '@/lib/guideSession';

// 혼잡도별 경로선 색 — 막힐수록 붉게. 원활은 기존 경로색, 정보 없음은 회색.
// 서행은 semantic.warning(amber-600)보다 밝은 amber-500 — 지도 위 가시성 우선.
const TRAFFIC_COLORS: Record<number, string> = {
  4: semantic.success, // 원활
  3: '#F59E0B', // 서행
  2: semantic.danger, // 지체
  1: '#B91C1C', // 정체
  0: '#9CA3AF', // 정보 없음
};

// 길찾기 경유지 상한 — 직접 고르는 지점이라 코스 샘플링(20개)과 별개다
const MAX_USER_VIAS = 5;

// 검색 모달이 어느 필드를 채우는 중인지 — 숫자는 경유지 인덱스
type EditingField = 'start' | 'goal' | number;

// 경로 편집 카드의 행 높이 — 드래그 타깃 계산이 이 값의 균일 격자에 기댄다
// (+ 버튼은 divider 위에 떠 있어 세로 공간을 차지하지 않는다)
const ROW_H = 44;

// 드래그 중인 행의 현재 y 에 가장 가까운 슬롯 — 드롭 타깃이자,
// 다른 행들이 실시간으로 비켜줄 기준이다.
function nearestSlot(curY: number, rowCount: number) {
  'worklet';
  return Math.max(0, Math.min(rowCount - 1, Math.round(curY / ROW_H)));
}

// 길안내 진입 화면 — 경로 미리보기와 옵션 선택을 겸한다.
// 옵션별 경로를 지도에 그려 보여주고, 고르면 그 옵션으로 KNSDK 안내를 시작한다.
// 미리보기도 안내와 같은 KNSDK 엔진을 쓰므로 여기서 본 경로가 곧 안내 경로다.
// 코스 안내가 아니면 상단 카드에서 출발지·경유지·도착지를 바로 바꿀 수 있다
// (코스 경유지는 지오메트리 좌표 수십 개라 편집 대상이 아니다).
export default function NaviScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const startGuideSession = useGuideSession((st) => st.start);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { lng, lat, name, vias, uvias, slng, slat, sname, pid, cid } = useLocalSearchParams<{
    lng: string;
    lat: string;
    name?: string;
    /** JSON "[lng,lat,...]" — 코스 안내의 경유지 */
    vias?: string;
    /** JSON NavTarget[] — 길찾기 페이지에서 미리 고른 경유지(편집 가능) */
    uvias?: string;
    /** 출발지 지정(길찾기) — 없으면 현재 위치에서 출발 */
    slng?: string;
    slat?: string;
    sname?: string;
    /** 도착 후 리뷰 연결 — 등록 장소 id / 코스 id */
    pid?: string;
    cid?: string;
  }>();

  const mapRef = useRef<NaverMapViewRef>(null);

  // 도착지 — 파라미터는 초기값일 뿐, 상단 카드에서 바꿀 수 있다.
  // 바꾸면 placeId(도착 후 리뷰 연결)는 원래 장소 것이라 함께 버린다.
  const [goal, setGoal] = useState<NavTarget>({
    name: name ?? '목적지',
    latitude: Number(lat),
    longitude: Number(lng),
    placeId: pid,
  });
  const [start, setStart] = useState<[number, number] | null>(
    slng && slat ? [Number(slng), Number(slat)] : null,
  ); // [lng, lat]
  // 지정 출발지의 이름 — null 이면 현재 위치 출발
  const [startName, setStartName] = useState<string | null>(sname ?? null);
  // 길찾기 경유지(편집 가능) — 코스 경유지(vias 파라미터)와 별개.
  // null 은 + 로 만든 빈 줄: 탭해서 채우기 전까지 경로에는 안 들어간다.
  const [userVias, setUserVias] = useState<(NavTarget | null)[]>(
    uvias ? JSON.parse(uvias) : [],
  );
  const [editing, setEditing] = useState<EditingField | null>(null);
  // 드래그 중인 행(논리 인덱스: 출발 0, 경유지 1.., 도착 마지막)과 이동량
  const dragIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  // 안내가 시작되면 미리보기 지도를 렌더에서 내린다 — 화면 replace 만으로는
  // 네이티브 마커(출발 도트)가 재활용 과정에서 지도 탭에 남을 수 있다(실기기
  // 보고). 안내 화면이 위를 덮은 뒤라 사용자에게는 보이지 않는 전환이다.
  const [guideStarted, setGuideStarted] = useState(false);
  const [priority, setPriority] = useState<RoutePriority>(0);
  const [routes, setRoutes] = useState<Partial<Record<RoutePriority, BikeRoute>>>({});
  // 옵션별 혼잡 구간(경로선 색칠용). 없으면 SDK 선형을 단색으로 그린다.
  const [traffic, setTraffic] = useState<Partial<Record<RoutePriority, TrafficPart[]>>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // 현재 위치에서 도로가 이어지지 않는 원거리 코스(예: 육지→제주)는
  // 코스 출발지 기준 미리보기로 폴백한다. 이때 안내 시작은 막는다.
  const [courseOnly, setCourseOnly] = useState(false);
  // 20412(경유지가 도로와 안 이어짐)로 경유지를 줄여 성공한 경우의 경유지.
  // 안내 시작도 이 목록을 그대로 쓴다.
  const [activeVias, setActiveVias] = useState<number[] | null>(null);

  const courseVias: number[] = vias ? JSON.parse(vias) : [];
  const isCourseMode = !!cid || courseVias.length > 0;
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

  const handleFieldSelect = (point: Point) => {
    const field = editing;
    setEditing(null);
    if (field === null) return;
    if (field === 'start') {
      if (point === 'current') {
        // 출발지를 현재 위치로 되돌린다 — null 로 두면 아래 effect 가 다시 픽스한다
        setStartName(null);
        setStart(null);
      } else {
        setStartName(point.name);
        setStart([point.longitude, point.latitude]);
      }
    } else if (point === 'current') {
      return; // 도착지·경유지에 '현재 위치'는 모달에서 막지만 한 번 더 거른다
    } else if (field === 'goal') {
      setGoal({ name: point.name, latitude: point.latitude, longitude: point.longitude });
    } else {
      setUserVias((prev) => prev.map((v, i) => (i === field ? point : v)));
    }
    resetRoutes();
  };

  // + 줄 — 빈 경유지 줄만 만든다. 채우기 전엔 경로에 영향이 없다.
  const addEmptyVia = () => {
    setUserVias((prev) => (prev.length >= MAX_USER_VIAS ? prev : [...prev, null]));
  };

  const removeVia = (index: number) => {
    const wasEmpty = !userVias[index];
    setUserVias((prev) => prev.filter((_, i) => i !== index));
    if (!wasEmpty) resetRoutes();
  };

  const swapEnds = () => {
    if (!start) return; // 현재 위치를 아직 확보 중이면 바꿀 게 없다
    const prevGoal = goal;
    setGoal({ name: startName ?? '현재 위치', latitude: start[1], longitude: start[0] });
    setStartName(prevGoal.name);
    setStart([prevGoal.longitude, prevGoal.latitude]);
    setUserVias((prev) => [...prev].reverse()); // 왕복 반전이니 들르는 순서도 뒤집는다
    resetRoutes();
  };

  // 드래그 재정렬 — 행 전체(출발·경유지·도착)를 하나의 목록으로 본다.
  // 첫 행이 출발지, 마지막 행이 도착지가 되도록 state 를 다시 나눈다.
  const reorderRows = (from: number, to: number) => {
    // 재배열이 무산되는 경로에서만 여기서 드래그 오프셋을 푼다.
    // 성공 경로는 새 순서가 커밋된 직후(useLayoutEffect)에 푼다 — 커밋 전에
    // 풀면 옛 레이아웃 위에서 행들이 한 번 더 미끄러진다(실기기 보고).
    const resetDrag = () => {
      dragIndex.value = -1;
      dragY.value = 0;
    };
    if (from === to || !start) return resetDrag();
    type Row =
      | { kind: 'start' }
      | { kind: 'goal' }
      | { kind: 'via'; via: NavTarget | null };
    const rows: Row[] = [
      { kind: 'start' },
      ...userVias.map((v) => ({ kind: 'via' as const, via: v })),
      { kind: 'goal' },
    ];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    const first = rows[0];
    const last = rows[rows.length - 1];
    // 빈 경유지 줄은 출발·도착이 될 수 없다
    if ((first.kind === 'via' && !first.via) || (last.kind === 'via' && !last.via))
      return resetDrag();

    const asTarget = (row: Row): NavTarget =>
      row.kind === 'start'
        ? { name: startName ?? '현재 위치', latitude: start[1], longitude: start[0] }
        : row.kind === 'goal'
          ? goal
          : row.via!;

    if (first.kind !== 'start') {
      const t = asTarget(first);
      setStartName(t.name);
      setStart([t.longitude, t.latitude]);
    }
    if (last.kind !== 'goal') {
      // 도착지가 다른 지점으로 바뀌므로 placeId(리뷰 연결)도 새 지점 기준이 된다
      const t = asTarget(last);
      setGoal({ name: t.name, latitude: t.latitude, longitude: t.longitude });
    }
    setUserVias(rows.slice(1, -1).map((r) => (r.kind === 'via' ? r.via : asTarget(r))));
    resetRoutes();
  };
  // 제스처 콜백은 attach 시점의 클로저를 물 수 있어(리프레시·리렌더 타이밍에
  // 낡은 reorderRows 가 불리는 걸 실측) ref 를 거쳐 항상 최신 본문을 태운다.
  const reorderRef = useRef(reorderRows);
  reorderRef.current = reorderRows;
  const dispatchReorder = useCallback(
    (from: number, to: number) => reorderRef.current(from, to),
    [],
  );

  // 행 수도 같은 이유로 shared value 로 미러링해 worklet 이 늘 최신을 본다
  const rowCountSv = useSharedValue(userVias.length + 2);
  useEffect(() => {
    rowCountSv.value = userVias.length + 2;
  }, [userVias.length, rowCountSv]);

  // 드롭 확정 — 재배열된 목록이 커밋된 직후(페인트 전) 드래그 오프셋을 풀어
  // 새 레이아웃과 한 프레임에 맞물리게 한다. 드롭한 자리가 그대로 유지된다.
  useLayoutEffect(() => {
    dragIndex.value = -1;
    dragY.value = 0;
  }, [userVias, dragIndex, dragY]);

  // 행 왼쪽 핸들의 팬 제스처 — 행 높이 격자로 드롭 슬롯을 정한다
  const makeRowPan = (index: number) =>
    Gesture.Pan()
      .onStart(() => {
        dragIndex.value = index;
        dragY.value = 0;
      })
      .onUpdate((e) => {
        dragY.value = e.translationY;
      })
      .onEnd(() => {
        runOnJS(dispatchReorder)(
          index,
          nearestSlot(index * ROW_H + dragY.value, rowCountSv.value),
        );
      })
      .onFinalize((_e, success) => {
        // 정상 드롭의 해제는 reorderRows·커밋 훅이 맡는다 — 취소·실패만 즉시 원복
        if (!success) {
          dragIndex.value = -1;
          dragY.value = 0;
        }
      });

  // 안내 시작 신호 — 안내 화면이 덮인 동안 밑 화면을 지도로 바꿔 둔다.
  // 닫힘 주도권이 SDK 쪽에도 있어(도착 자동 종료 등) 닫힘 타이밍은 잡을 수 없다.
  // 밑이 항상 지도면 어떤 경로로 걷히든 지도가 드러난다. 종료·메뉴 이벤트
  // 처리는 이 화면이 언마운트된 뒤에도 살아 있도록 전역(lib/guideEvents)이 맡는다.
  useEffect(() => {
    const started = KakaoNavi.addListener('onGuideStarted', () => {
      startGuideSession(
        {
          latitude: goal.latitude,
          longitude: goal.longitude,
          name: goal.name,
          placeId: goal.placeId,
          courseId: cid,
        },
        priority,
      );
      // 오버레이(출발 도트·경로선)를 먼저 정상 해제시키고 화면을 뗀다
      setGuideStarted(true);
      navigation.setOptions({ animation: 'none' });
      // navigate 는 이 화면을 스택에 남긴다 — 미리보기 지도(출발지 도트)가
      // 살아남아 안내 종료 후 지도 위에 비쳤다(실측). replace 로 스택에서 뗀다.
      router.replace('/');
    });
    // 경로 탐색 실패 시 시작 스피너만 되돌린다 (토스트는 전역 리스너가 띄운다)
    const failed = KakaoNavi.addListener('onGuideFailed', () => setStarting(false));
    return () => {
      started.remove();
      failed.remove();
    };
  }, [router, navigation, cid, goal, priority]);

  // 출발지 확보 — 지정돼 있으면 그대로(초기값), 아니면 현재 위치.
  // 지도 탭이 위치를 상시 추적 중이라 대개는 스토어 값으로 즉시 시작하고,
  // 없을 때만(권한 전 딥링크 등) 새 픽스를 기다린다. 상단 카드에서 출발지를
  // '현재 위치'로 되돌리면 start 가 null 이 되어 여기가 다시 돈다.
  useEffect(() => {
    if (start) return;
    const cached = useMapStore.getState().userLocation;
    if (cached) {
      setStart([cached.longitude, cached.latitude]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.error('위치 권한이 필요합니다', '길안내를 시작할 수 없습니다.');
        router.back();
        return;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!cancelled) {
        setStart([current.coords.longitude, current.coords.latitude]);
      }
    })().catch(() => {
      if (!cancelled) {
        toast.error('현재 위치를 확인할 수 없습니다');
        router.back();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router, start]);

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
      toast.error('경로를 찾을 수 없습니다', friendlyRouteError(lastErr));
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias·userVias·courseOnly 에서 파생
  }, [effStart?.[0], effStart?.[1], priority, routes, goal.longitude, goal.latitude, vias, userVias, courseOnly, activeVias]);

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

  // 경로가 바뀌면 전체가 보이도록 카메라를 맞춘다.
  // 남쪽은 하단 카드가 덮는 만큼 더 벌린다.
  useEffect(() => {
    if (!route || route.polyline.length < 4) return;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (let i = 0; i + 1 < route.polyline.length; i += 2) {
      const lng = route.polyline[i];
      const lat = route.polyline[i + 1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lngSpan = Math.max(maxLng - minLng, 0.01);
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: {
        latitude: minLat - latSpan * 0.45,
        longitude: minLng - lngSpan * 0.1,
      },
      coord2: {
        // 북쪽은 경로 편집 카드가 덮는 만큼 더 벌린다 (코스 안내에는 카드가 없다)
        latitude: maxLat + latSpan * (isCourseMode ? 0.1 : 0.35),
        longitude: maxLng + lngSpan * 0.1,
      },
      duration: 700,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isCourseMode 는 파라미터에서 파생돼 불변
  }, [route]);

  const startGuide = () => {
    if (!start || starting || courseOnly) return;
    setStarting(true);
    KakaoNavi.startGuide(start[0], start[1], goal.longitude, goal.latitude, goal.name, activeVias ?? flatVias, priority).catch(
      (err) => {
        setStarting(false);
        toast.error('길안내를 시작할 수 없습니다', friendlyRouteError(err));
      },
    );
  };

  // 폴리라인은 수천 좌표라 리렌더마다 새로 만들면 네이티브 브리지로 통째로
  // 재전송된다 — 경로가 바뀔 때만 변환하고, 혼잡도 색 경로가 있으면 단색용
  // coords 는 아예 만들지 않는다.
  const trafficParts = traffic[priority];
  const coords = useMemo(
    () =>
      route && route.polyline.length >= 4 && !trafficParts
        ? latLngsFromFlat(route.polyline)
        : null,
    [route, trafficParts],
  );
  const pathParts = useMemo(
    () =>
      trafficParts?.map((p) => ({
        coords: p.coords,
        color: TRAFFIC_COLORS[p.state] ?? semantic.success,
        outlineColor: '#FFFFFF',
      })),
    [trafficParts],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!guideStarted && (
      <NaverMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        isShowZoomControls={false}
        locale="ko"
        // 위치 오버레이를 강제로 끈다 — 재활용된 지도 뷰가 지도 탭의 오버레이
        // 상태를 물려받아 고아 위치 마커가 화면에 남았다(실기기 영상으로 확정)
        locationOverlay={{ isVisible: false }}
        initialCamera={{ latitude: goal.latitude, longitude: goal.longitude, zoom: 12 }}>
        {start && (
          // 출발점 도트 — children 커스텀 뷰는 캡처용 네이티브 뷰가 화면에
          // 고아로 남는 문제가 있어(실기기: 좌표에 안 붙고 떠다니는 잔상)
          // 정적 이미지로 그린다.
          <NaverMapMarkerOverlay
            latitude={start[1]}
            longitude={start[0]}
            width={18}
            height={18}
            anchor={{ x: 0.5, y: 0.5 }}
            image={require('@/assets/images/origin-dot.png')}
          />
        )}
        {pathParts ? (
          // 혼잡도 색 경로 — 선형도 색과 같은 REST 응답 것을 쓴다(색·선 불일치 방지)
          <NaverMapMultiPathOverlay pathParts={pathParts} width={6} outlineWidth={2} />
        ) : coords ? (
          <NaverMapPathOverlay
            coords={coords}
            width={6}
            color={semantic.success}
            outlineWidth={2}
            outlineColor="#FFFFFF"
          />
        ) : null}
        <TempPlaceMarker latitude={goal.latitude} longitude={goal.longitude} />
      </NaverMapView>
      )}

      {isCourseMode ? (
        /* 코스 안내 — 편집할 지점이 없으니 닫기 버튼만 */
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.closeButton,
            { top: insets.top + 8, backgroundColor: colors.background },
          ]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      ) : (
        !guideStarted && (
          /* 경로 편집 카드 — 필드를 탭하면 그 지점을 바꾸고 경로를 다시 그린다 */
          <View
            style={[
              styles.routeCard,
              {
                top: insets.top + 8,
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.routeFields}>
              <RouteFieldRow
                icon="radiobox-marked"
                value={startName ?? '현재 위치'}
                onPress={() => !starting && setEditing('start')}
                index={0}
                rowCountSv={rowCountSv}
                dragIndex={dragIndex}
                dragY={dragY}
                pan={makeRowPan(0)}
              />
              {userVias.map((via, i) => (
                <View key={i}>
                  <View style={[styles.routeDivider, { backgroundColor: colors.border }]} />
                  <RouteFieldRow
                    icon="circle-medium"
                    value={via?.name ?? ''}
                    placeholder="경유지 입력"
                    onPress={() => !starting && setEditing(i)}
                    onRemove={() => removeVia(i)}
                    index={i + 1}
                    rowCountSv={rowCountSv}
                    dragIndex={dragIndex}
                    dragY={dragY}
                    pan={makeRowPan(i + 1)}
                  />
                </View>
              ))}
              {/* 경유지가 없을 때만 사이에 + 를 띄운다(줄 미차지). 경유지가 생기면
                  ⊖ 와의 세로 근접을 피해 + 는 도착지 행 오른쪽 끝으로 옮겨 단다. */}
              <View style={styles.routeDividerWrap}>
                <View style={[styles.routeDivider, { backgroundColor: colors.border }]} />
                {userVias.length === 0 && (
                  <Pressable
                    onPress={addEmptyVia}
                    hitSlop={8}
                    style={[
                      styles.routeInsertButton,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}>
                    <MaterialCommunityIcons name="plus" size={14} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
              <RouteFieldRow
                icon="map-marker"
                value={goal.name}
                onPress={() => !starting && setEditing('goal')}
                onAdd={
                  userVias.length > 0 && userVias.length < MAX_USER_VIAS
                    ? addEmptyVia
                    : undefined
                }
                index={userVias.length + 1}
                rowCountSv={rowCountSv}
                dragIndex={dragIndex}
                dragY={dragY}
                pan={makeRowPan(userVias.length + 1)}
              />
            </View>
            {/* 오른쪽 열 — 닫기는 상단(왼쪽 핸들과 멀리), 스왑은 세로 중앙 */}
            <View style={styles.routeSide}>
              <Pressable onPress={() => router.back()} hitSlop={8} style={styles.routeClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={swapEnds}
                hitSlop={6}
                style={[styles.routeActionButton, { borderColor: colors.border }]}>
                <MaterialCommunityIcons
                  name="swap-vertical"
                  size={17}
                  color={colors.textSecondary}
                />
              </Pressable>
              <View style={styles.routeSideSpacer} />
            </View>
          </View>
        )
      )}

      {/* 하단: 목적지 + 옵션 + 경로 정보 + 시작 */}
      <View
        style={[
          styles.card,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}>
        {courseOnly && (
          <Text
            style={[styles.startName, { color: colors.textSecondary }]}
            numberOfLines={2}>
            코스 출발지 기준 미리보기: 현재 위치에서 이어지는 도로가 없어요
          </Text>
        )}
        <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>
          {goal.name}
        </Text>

        <View style={styles.chipRow}>
          {ROUTE_PRIORITIES.map((p) => {
            const active = p.value === priority;
            return (
              <Pressable
                key={p.value}
                onPress={() => setPriority(p.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.tint : colors.surfaceMuted,
                    borderColor: active ? colors.tint : colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.background : colors.text },
                  ]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.infoRow, (loading || !route) && styles.infoRowCentered]}>
          {loading || !route ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatMeters(route.distance)}
              </Text>
              <View style={[styles.dot, { backgroundColor: colors.border }]} />
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatSeconds(route.duration)}
              </Text>
            </>
          )}
        </View>

        <Pressable
          onPress={startGuide}
          disabled={!route || starting || courseOnly}
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: colors.tint,
              opacity: !route || starting || courseOnly ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          {starting ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={[styles.startLabel, { color: colors.background }]}>
              {courseOnly ? '코스 근처에서 시작할 수 있어요' : '안내 시작'}
            </Text>
          )}
        </Pressable>
      </View>

      <PointSearchModal
        visible={editing !== null}
        allowCurrent={editing === 'start'}
        allowSaved
        title={
          editing === 'start'
            ? '출발지 변경'
            : editing === 'goal'
              ? '도착지 변경'
              : typeof editing === 'number' && !userVias[editing]
                ? '경유지 추가'
                : '경유지 변경'
        }
        onClose={() => setEditing(null)}
        onSelect={handleFieldSelect}
      />
    </View>
  );
}

function RouteFieldRow({
  icon,
  value,
  placeholder,
  onPress,
  onRemove,
  onAdd,
  index,
  rowCountSv,
  dragIndex,
  dragY,
  pan,
}: {
  icon: 'radiobox-marked' | 'circle-medium' | 'map-marker';
  value: string;
  placeholder?: string;
  onPress: () => void;
  onRemove?: () => void;
  /** 도착지 행 오른쪽 끝의 경유지 추가 버튼 (경유지가 있을 때) */
  onAdd?: () => void;
  /** 재정렬 목록에서의 논리 인덱스 (출발 0 … 도착 마지막) */
  index: number;
  rowCountSv: SharedValue<number>;
  dragIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  pan: ReturnType<typeof Gesture.Pan>;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  // 드래그 중인 행은 손가락을 따라 떠오르고, 나머지 행은 드래그 행이
  // 지날 슬롯을 실시간으로 비켜준다(네이버 지도식). 놓으면 그 순서로 재배열.
  const animatedStyle = useAnimatedStyle(() => {
    const from = dragIndex.value;
    if (from === index) {
      return {
        transform: [{ translateY: dragY.value }, { scale: 1.03 }],
        zIndex: 10,
        opacity: 0.95,
      };
    }
    if (from < 0) {
      // 드래그 종료 상태는 애니메이션 없이 즉시 제자리 — 재배열 커밋과 같은
      // 프레임에 확정돼야 드롭 후 잔여 슬라이드가 안 생긴다
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        zIndex: 0,
        opacity: 1,
      };
    }
    const target = nearestSlot(from * ROW_H + dragY.value, rowCountSv.value);
    let shift = 0;
    if (from < index && index <= target) shift = -ROW_H; // 드래그 행이 내려와 내 자리를 차지
    else if (target <= index && index < from) shift = ROW_H; // 드래그 행이 올라와 내 자리를 차지
    return {
      transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }],
      zIndex: 0,
      opacity: 1,
    };
  });
  return (
    <Animated.View style={animatedStyle}>
      <View style={styles.routeFieldRow}>
        <GestureDetector gesture={pan}>
          <View style={styles.routeFieldHandle} collapsable={false}>
            <MaterialCommunityIcons
              name="unfold-more-horizontal"
              size={16}
              color={colors.textSecondary}
            />
          </View>
        </GestureDetector>
        <Pressable onPress={onPress} style={styles.routeFieldMain}>
          <MaterialCommunityIcons name={icon} size={15} color={colors.textSecondary} />
          <Text
            style={[
              styles.routeFieldValue,
              { color: value ? colors.text : colors.textSecondary },
            ]}
            numberOfLines={1}>
            {value || placeholder}
          </Text>
        </Pressable>
        {onRemove && (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            style={[styles.routeCircleButton, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="minus" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
        {onAdd && (
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            style={[styles.routeCircleButton, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="plus" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  routeCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  // 닫기(상단)·스왑(중앙)·스페이서가 세로로 늘어선 오른쪽 열.
  // 닫기를 드래그 핸들(왼쪽)과 떨어뜨려 오작을 막는다.
  routeSide: {
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 6,
    paddingVertical: 2,
  },
  routeClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeSideSpacer: {
    height: 28,
  },
  routeFields: {
    flex: 1,
  },
  routeFieldRow: {
    // 높이 고정 — 드래그 재정렬의 슬롯 계산(ROW_H)이 이 값에 기댄다
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeFieldMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  routeFieldValue: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '500',
  },
  routeFieldHandle: {
    paddingRight: 8,
    paddingLeft: 2,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  routeDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 26,
  },
  // divider 를 흐름에 그대로 두고 + 버튼만 그 위에 띄운다 — 줄 높이 0
  routeDividerWrap: {
    justifyContent: 'center',
    zIndex: 5,
  },
  routeInsertButton: {
    position: 'absolute',
    right: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 행 오른쪽 끝의 ⊖·⊕ — 같은 테두리 원형으로 시각 언어를 맞춘다
  routeCircleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
  },
  routeActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  startName: {
    fontSize: 13,
    marginBottom: -6,
  },
  goalName: {
    fontSize: 17,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 24,
  },
  infoRowCentered: {
    justifyContent: 'center',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  startButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});

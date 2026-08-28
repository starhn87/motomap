import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import CloseIcon from '@/components/ui/CloseIcon';

import KakaoNavi, {
  ROUTE_PRIORITIES,
  friendlyRouteError,
  pairsFromFlat,
} from '@/modules/kakao-navi';
import type { NavTarget } from '@/lib/navigation';
import { hasMapOverlayInStack } from '@/lib/mapFocus';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { loadRecentSearches, recentTargets } from '@/lib/recentSearches';

import { useMapStore } from '@/stores/useMapStore';
import { haversine } from '@/lib/distance';
import PreviewMap from '@/components/navi/PreviewMap';
import RouteFieldRow, { ROW_H, nearestSlot } from '@/components/navi/RouteFieldRow';
import { useBikeRoutes } from '@/hooks/useBikeRoutes';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMeters, formatSeconds } from '@/lib/api/directions';
import { toast } from '@/lib/toast';
import { useGuideSession } from '@/lib/guideSession';
import { markGuideStarted } from '@/lib/guideEvents';
import { startRideRecording } from '@/lib/rideRecorder';
import { createAnalyticsId, track } from '@/lib/analytics';
import {
  parseNaviParams,
  type NaviRouteParams,
  type ParsedNaviParams,
} from '@/lib/naviParams';

// 길찾기 경유지 상한 — 직접 고르는 지점이라 코스 샘플링(20개)과 별개다
const MAX_USER_VIAS = 3;

// 정한 출발지가 이보다 멀면 실주행이 아니라 경로 미리보기로 본다.
// 걸어서 갈 만한 거리면 곧 그 자리에 서게 되므로 실주행이 맞다.
const PREVIEW_MIN_METERS = 300;

// 검색 모달이 어느 필드를 채우는 중인지 — 숫자는 경유지 인덱스
type EditingField = 'start' | 'goal' | number;

// 길안내 진입 화면 — 경로 미리보기와 옵션 선택을 겸한다.
// 옵션별 경로를 지도에 그려 보여주고, 고르면 그 옵션으로 KNSDK 안내를 시작한다.
// 미리보기도 안내와 같은 KNSDK 엔진을 쓰므로 여기서 본 경로가 곧 안내 경로다.
// 코스 안내가 아니면 상단 카드에서 출발지·경유지·도착지를 바로 바꿀 수 있다
// (코스 경유지는 지오메트리 좌표 수십 개라 편집 대상이 아니다).
export default function NaviScreen() {
  const params = useLocalSearchParams<NaviRouteParams>();
  const initial = parseNaviParams(params);
  return initial ? <NaviContent initial={initial} /> : <InvalidNaviParams />;
}

function InvalidNaviParams() {
  const router = useRouter();
  useEffect(() => {
    toast.error('길안내 정보를 확인할 수 없습니다');
    router.replace('/');
  }, [router]);
  return null;
}

function NaviContent({ initial }: { initial: ParsedNaviParams }) {
  const router = useRouter();
  const navigation = useNavigation();
  const startGuideSession = useGuideSession((st) => st.start);
  const userLocation = useMapStore((st) => st.userLocation);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { courseVias, courseId } = initial;

  // 도착지 — 파라미터는 초기값일 뿐, 상단 카드에서 바꿀 수 있다.
  // 바꾸면 placeId(도착 후 리뷰 연결)는 원래 장소 것이라 함께 버린다.
  const [goal, setGoal] = useState<NavTarget>(initial.goal);
  const [start, setStart] = useState<[number, number] | null>(initial.start); // [lng, lat]
  // 지정 출발지의 이름 — null 이면 현재 위치 출발
  const [startName, setStartName] = useState<string | null>(initial.startName);
  // 길찾기 경유지(편집 가능) — 코스 경유지(vias 파라미터)와 별개.
  // null 은 + 로 만든 빈 줄: 탭해서 채우기 전까지 경로에는 안 들어간다.
  const [userVias, setUserVias] = useState<(NavTarget | null)[]>(
    initial.userVias,
  );
  const [editing, setEditing] = useState<EditingField | null>(null);
  // 지점 검색 모달의 최근 검색 제안 — 검색·길찾기 화면과 같은 저장소를 공유한다
  const [recents, setRecents] = useState<(NavTarget & { address?: string })[]>([]);
  // 드래그 중인 행(논리 인덱스: 출발 0, 경유지 1.., 도착 마지막)과 이동량
  const dragIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  // 안내가 시작되면 미리보기 지도를 렌더에서 내린다 — 화면 replace 만으로는
  // 네이티브 마커(출발 도트)가 재활용 과정에서 지도 탭에 남을 수 있다(실기기
  // 보고). 안내 화면이 위를 덮은 뒤라 사용자에게는 보이지 않는 전환이다.
  const [guideStarted, setGuideStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  // 시작 계측 속성 — 탭 시점에 담아 두고 onGuideStarted 리스너가 찍는다
  const startTrackRef = useRef<Parameters<typeof track.navigationStarted>[0] | null>(null);

  const isCourseMode = !!courseId || courseVias.length > 0;

  // 지점 → 경로: 옵션별 캐시·경유지 축소 사다리·코스 폴백은 훅이 맡는다
  const {
    priority,
    setPriority,
    route,
    trafficParts,
    loading,
    courseOnly,
    activeVias,
    effVias,
    flatVias,
    resetRoutes,
  } = useBikeRoutes({ start, startName, goal, userVias, courseVias, isCourseMode });

  useEffect(() => {
    if (isCourseMode) return; // 편집 카드가 없으니 모달도 안 뜬다
    void loadRecentSearches().then((entries) =>
      setRecents(recentTargets(entries).map((r) => r.target)),
    );
  }, [isCourseMode]);
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
      // 등록 장소면 placeId 가 실려 와 도착 후 리뷰 연결이 이어진다
      setGoal({
        name: point.name,
        latitude: point.latitude,
        longitude: point.longitude,
        placeId: point.placeId,
        generalPlaceId: point.generalPlaceId,
      });
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

  // 행 왼쪽 핸들의 팬 제스처 — 행 높이 격자로 드롭 슬롯을 정한다.
  // 빈 경유지 줄(enabled=false)은 옮길 내용이 없으니 드래그를 막는다.
  const makeRowPan = (index: number, enabled = true) =>
    Gesture.Pan()
      .enabled(enabled)
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
      const startContext = startTrackRef.current;
      if (startTrackRef.current) {
        const startTrack = startTrackRef.current;
        startTrackRef.current = null;
        track.navigationStarted(startTrack);
        // 비정상 종료 정산용 마커 — 정상 종료(guideEvents)가 지운다
        void markGuideStarted(startTrack);
      }
      startGuideSession(
        {
          latitude: goal.latitude,
          longitude: goal.longitude,
          name: goal.name,
          placeId: goal.placeId,
          generalPlaceId: goal.generalPlaceId,
          courseId,
        },
        priority,
        // 등록 장소 경유지 — 도착하면 경유지에도 라이딩 1회를 센다
        userVias.flatMap((v) =>
          v?.placeId
            ? [{
                placeId: v.placeId,
                latitude: v.latitude,
                longitude: v.longitude,
              }]
            : [],
        ),
      );
      void startRideRecording(
        {
          latitude: goal.latitude,
          longitude: goal.longitude,
          name: goal.name,
          placeId: goal.placeId,
          generalPlaceId: goal.generalPlaceId,
        },
        startContext?.mode ?? 'live',
      ).catch(() => {
        // 경로 기록 실패가 길안내 시작을 방해하면 안 된다.
      });
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
  }, [router, navigation, courseId, goal, priority, userVias]);

  // 정한 출발지가 지금 있는 곳에서 멀면 실주행 안내가 아니라 경로 미리보기다.
  // 실주행 안내(KNGuidance)는 차량 위치를 늘 실제 GPS 에 매칭해서, 멀리 잡은
  // 출발지는 무시되고 현재 위치에서 시작돼 버린다. 가까우면 그냥 실주행으로 —
  // 어차피 출발지가 곧 현재 위치라 자연스럽게 맞는다.
  const previewOnly =
    !!startName && !!start && !!userLocation
      ? haversine(userLocation, { latitude: start[1], longitude: start[0] }) > PREVIEW_MIN_METERS
      : false;

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

  const startGuide = () => {
    if (!start || starting || courseOnly) return;
    setStarting(true);
    // 계측은 실제 시작 신호(onGuideStarted)에서 찍는다 — 여기서 찍으면 경로
    // 탐색 실패까지 "시작"으로 세어 완주율 분모가 부푼다. 리스너 useEffect 와
    // 렌더 시점이 달라 속성은 ref 로 넘긴다.
    startTrackRef.current = {
      guide_session_id: createAnalyticsId('guide'),
      mode: previewOnly ? 'preview' : 'live',
      priority,
      via_count: pairsFromFlat(activeVias ?? flatVias).length,
      distance_m: route?.distance,
    };
    KakaoNavi.startGuide(
      start[0], start[1], goal.longitude, goal.latitude, goal.name,
      activeVias ?? flatVias, priority, previewOnly,
    ).catch((err) => {
      setStarting(false);
      toast.error('길안내를 시작할 수 없습니다', friendlyRouteError(err));
    });
  };

  // 위아래 카드가 지도를 덮는 픽셀 — PreviewMap 의 카메라 핏이 이 값만큼
  // 경로를 밀어 넣는다. onLayout 으로 실측해 채운다.
  const topCardH = useRef(240);
  const bottomCardH = useRef(300);

  // 지도에 표시할 경유지 — 실제로 요청에 쓰인 것만 그린다. 20412(도로와 안 이어짐)
  // 폴백으로 줄어든 경우 빠진 지점은 들르지 않으므로 마커도 없어야 한다.
  // 코스 모드의 경유지는 코스 경로선 자체라 점을 찍으면 오히려 어지럽다.
  const viaMarkers = useMemo(() => {
    if (isCourseMode) return [];
    const flat = activeVias ?? effVias;
    const out: { latitude: number; longitude: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push({ longitude: flat[i], latitude: flat[i + 1] });
    }
    return out;
  }, [isCourseMode, activeVias, effVias]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!guideStarted && (
        <PreviewMap
          start={start}
          goal={goal}
          viaMarkers={viaMarkers}
          route={route}
          trafficParts={trafficParts}
          isCourseMode={isCourseMode}
          topCardH={topCardH}
          bottomCardH={bottomCardH}
        />
      )}

      {isCourseMode ? (
        /* 코스 안내 — 편집할 지점이 없으니 닫기 버튼만 */
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.closeButton,
            { top: insets.top + 8, backgroundColor: colors.background },
          ]}>
          <CloseIcon size={22} color={colors.text} />
        </Pressable>
      ) : (
        !guideStarted && (
          /* 경로 편집 카드 — 필드를 탭하면 그 지점을 바꾸고 경로를 다시 그린다 */
          <View
            onLayout={(e) => {
              topCardH.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
            }}
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
                    pan={makeRowPan(i + 1, via !== null)}
                    dragDisabled={via === null}
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
            {/* 오른쪽 열 — 닫기는 상단, 스왑은 최하단(닫기와 오터치 안 나게 멀리) */}
            <View style={styles.routeSide}>
              <Pressable
                onPress={() => {
                  // 닫기의 기대는 "다 접고 맨 지도로" — 지도 탭에 남아 있던
                  // 장소 시트·카드도 함께 정리한다
                  useMapStore.getState().requestMapReset();
                  // 오버레이(장소 상세 지도)를 거쳐 여기까지 왔다면 back 은
                  // 오버레이→미리보기→… 를 되감을 뿐이다 — 탭 루트로 바로.
                  if (hasMapOverlayInStack()) {
                    router.dismissAll();
                  } else {
                    router.back();
                  }
                }}
                hitSlop={8}
                style={styles.routeClose}>
                <CloseIcon size={20} color={colors.text} />
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
            </View>
          </View>
        )
      )}

      {/* 하단: 목적지 + 옵션 + 경로 정보 + 시작 */}
      <View
        onLayout={(e) => {
          bottomCardH.current = e.nativeEvent.layout.height;
        }}
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
              {courseOnly
                ? '코스 근처에서 시작할 수 있어요'
                : previewOnly
                  ? '경로 미리보기'
                  : '안내 시작'}
            </Text>
          )}
        </Pressable>
      </View>

      <PointSearchModal
        visible={editing !== null}
        allowCurrent={editing === 'start'}
        allowSaved
        recents={recents}
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
    paddingTop: 2,
    paddingBottom: 12,
  },
  routeClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeFields: {
    flex: 1,
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
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NaverMapView,
  NaverMapPathOverlay,
  NaverMapMultiPathOverlay,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';

import KakaoNavi, {
  ROUTE_PRIORITIES,
  friendlyRouteError,
  latLngsFromFlat,
  pairsFromFlat,
  routeErrorCode,
  type BikeRoute,
  type RoutePriority,
} from '@/modules/kakao-navi';
import { sampleWaypoints } from '@/lib/navigation';
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

// 길안내 진입 화면 — 경로 미리보기와 옵션 선택을 겸한다.
// 옵션별 경로를 지도에 그려 보여주고, 고르면 그 옵션으로 KNSDK 안내를 시작한다.
// 미리보기도 안내와 같은 KNSDK 엔진을 쓰므로 여기서 본 경로가 곧 안내 경로다.
export default function NaviScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const startGuideSession = useGuideSession((st) => st.start);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { lng, lat, name, vias, slng, slat, sname, pid, cid } = useLocalSearchParams<{
    lng: string;
    lat: string;
    name?: string;
    /** JSON "[lng,lat,...]" — 코스 안내의 경유지 */
    vias?: string;
    /** 출발지 지정(길찾기) — 없으면 현재 위치에서 출발 */
    slng?: string;
    slat?: string;
    sname?: string;
    /** 도착 후 리뷰 연결 — 등록 장소 id / 코스 id */
    pid?: string;
    cid?: string;
  }>();

  const mapRef = useRef<NaverMapViewRef>(null);

  const [start, setStart] = useState<[number, number] | null>(null); // [lng, lat]
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

  const goalLng = Number(lng);
  const goalLat = Number(lat);
  const goalName = name ?? '목적지';
  const flatVias: number[] = vias ? JSON.parse(vias) : [];
  // 폴백 시: 첫 경유지(코스 출발지)가 출발점이 되고 나머지가 경유지로 남는다
  const effStart: [number, number] | null = courseOnly
    ? [flatVias[0], flatVias[1]]
    : start;
  const effVias = courseOnly ? flatVias.slice(2) : flatVias;
  const route = routes[priority];

  // 안내 시작 신호 — 안내 화면이 덮인 동안 밑 화면을 지도로 바꿔 둔다.
  // 닫힘 주도권이 SDK 쪽에도 있어(도착 자동 종료 등) 닫힘 타이밍은 잡을 수 없다.
  // 밑이 항상 지도면 어떤 경로로 걷히든 지도가 드러난다. 종료·메뉴 이벤트
  // 처리는 이 화면이 언마운트된 뒤에도 살아 있도록 전역(lib/guideEvents)이 맡는다.
  useEffect(() => {
    const started = KakaoNavi.addListener('onGuideStarted', () => {
      startGuideSession(
        {
          latitude: goalLat,
          longitude: goalLng,
          name: goalName,
          placeId: pid,
          courseId: cid,
        },
        priority,
      );
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
  }, [router, navigation, pid, cid, goalLat, goalLng, goalName, priority]);

  // 출발지 확보 — 지정돼 있으면 그대로, 아니면 현재 위치.
  // 지도 탭이 위치를 상시 추적 중이라 대개는 스토어 값으로 즉시 시작하고,
  // 없을 때만(권한 전 딥링크 등) 새 픽스를 기다린다.
  useEffect(() => {
    if (slng && slat) {
      setStart([Number(slng), Number(slat)]);
      return;
    }
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
  }, [router, slng, slat]);

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
            effStart[0], effStart[1], goalLng, goalLat, tryVias, priority,
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

      // 현재 위치 출발이 막히고 경유지가 있으면(코스 안내) 코스 출발지 기준으로 재시도
      if (!courseOnly && !slng && flatVias.length >= 2) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias 문자열·courseOnly 에서 파생
  }, [effStart?.[0], effStart?.[1], priority, routes, goalLng, goalLat, vias, courseOnly, activeVias]);

  // 혼잡 구간 색칠 — 같은 엔진인 REST 로 같은 조건을 조회한다. 경유지가 없으면
  // 입력이 이미 확정이라 SDK 경로 요청과 병렬로 바로 쏘고(색칠이 SDK 왕복만큼
  // 빨라진다), 경유지가 있으면 사다리가 경유지를 줄일 수 있어 경로 확정을
  // 기다린다. 경로 useEffect 안에서 부르면 setRoutes 가 deps(routes)를 바꿔
  // cleanup 이 돌고 응답이 cancelled 에 막혀 버려진다(실측). 실패하면 단색 그대로.
  useEffect(() => {
    if (!effStart || traffic[priority]) return;
    if (effVias.length > 0 && !route) return;
    let cancelled = false;
    fetchBikeTraffic(effStart, [goalLng, goalLat], pairsFromFlat(activeVias ?? effVias), priority)
      .then((parts) => {
        if (!cancelled) setTraffic((prev) => ({ ...prev, [priority]: parts }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias·courseOnly 에서 파생
  }, [effStart?.[0], effStart?.[1], route, priority, goalLng, goalLat, activeVias]);

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
        latitude: maxLat + latSpan * 0.1,
        longitude: maxLng + lngSpan * 0.1,
      },
      duration: 700,
    });
  }, [route]);

  const startGuide = () => {
    if (!start || starting || courseOnly) return;
    setStarting(true);
    KakaoNavi.startGuide(start[0], start[1], goalLng, goalLat, goalName, activeVias ?? flatVias, priority).catch(
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
        initialCamera={{ latitude: goalLat, longitude: goalLng, zoom: 12 }}>
        {start && (
          <NaverMapMarkerOverlay
            latitude={start[1]}
            longitude={start[0]}
            width={18}
            height={18}
            anchor={{ x: 0.5, y: 0.5 }}>
            {/* 출발점 도트 — 흰 테두리 + 초록 심. 마커는 정적 뷰만 그려진다 */}
            <View style={styles.originDot}>
              <View style={styles.originDotCore} />
            </View>
          </NaverMapMarkerOverlay>
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
        <TempPlaceMarker latitude={goalLat} longitude={goalLng} />
      </NaverMapView>

      {/* 닫기 */}
      <Pressable
        onPress={() => router.back()}
        style={[
          styles.closeButton,
          { top: insets.top + 8, backgroundColor: colors.background },
        ]}>
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>

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
        {sname && (
          <Text
            style={[styles.startName, { color: colors.textSecondary }]}
            numberOfLines={1}>
            출발 · {sname}
          </Text>
        )}
        {courseOnly && (
          <Text
            style={[styles.startName, { color: colors.textSecondary }]}
            numberOfLines={2}>
            코스 출발지 기준 미리보기: 현재 위치에서 이어지는 도로가 없어요
          </Text>
        )}
        <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>
          {goalName}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  originDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  originDotCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    // 경로선(초록)과 겹치지 않는 진한 파랑 — 바다색(연파랑)과도 구분된다
    backgroundColor: '#2563EB',
  },
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

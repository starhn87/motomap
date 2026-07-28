import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NaverMapView,
  NaverMapPathOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';

import KakaoNavi, {
  ROUTE_PRIORITIES,
  type BikeRoute,
  type RoutePriority,
} from '@/modules/kakao-navi';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMeters, formatSeconds } from '@/lib/api/directions';
import { toast } from '@/lib/toast';
import { haversine } from '@/lib/distance';
import { HAZARD_LIST } from '@/constants/hazards';
import { submitHazard } from '@/lib/api/hazards';
import { fetchNearbyPlaces } from '@/lib/api/places';
import { focusPlaceOnMap } from '@/lib/mapFocus';

// 길안내 진입 화면 — 경로 미리보기와 옵션 선택을 겸한다.
// 옵션별 경로를 지도에 그려 보여주고, 고르면 그 옵션으로 KNSDK 안내를 시작한다.
// 미리보기도 안내와 같은 KNSDK 엔진을 쓰므로 여기서 본 경로가 곧 안내 경로다.
export default function NaviScreen() {
  const router = useRouter();
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

  const friendlyRouteError = (err: unknown): string => {
    const raw = String((err as any)?.message ?? err);
    if (raw.includes('20413')) {
      return '자동차 전용도로를 빼면 이어지는 도로가 없어요. 바다 건너나 도로가 끊긴 곳은 안내할 수 없어요.';
    }
    if (raw.includes('20412')) {
      return '경유지가 도로와 이어지지 않아요.';
    }
    return raw;
  };
  const [start, setStart] = useState<[number, number] | null>(null); // [lng, lat]
  const [priority, setPriority] = useState<RoutePriority>(0);
  const [routes, setRoutes] = useState<Partial<Record<RoutePriority, BikeRoute>>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // 현재 위치에서 도로가 이어지지 않는 원거리 코스(예: 육지→제주)는
  // 코스 출발지 기준 미리보기로 폴백한다. 이때 안내 시작은 막는다.
  const [courseOnly, setCourseOnly] = useState(false);
  // 안내 중 '근처 장소'로 목적지를 바꾼 경우 — 도착 판정·리뷰 연결이 새 목적지를 본다
  const [goalOverride, setGoalOverride] = useState<{
    lng: number;
    lat: number;
    name: string;
    placeId?: string;
  } | null>(null);
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

  // 안내 종료·실패 이벤트 — 안내는 네이티브 전체화면이라 이벤트로만 돌아온다.
  // 종료 시 목적지 근처면(취소가 아니라 도착으로 보고) 리뷰 작성으로 잇는다.
  useEffect(() => {
    // 안내가 끝나면 즉시 지도 화면으로 — 네이티브 화면이 아직 덮고 있는 동안
    // 이동해 두면 닫힘이 걷혔을 때 이전 화면이 아니라 지도가 바로 보인다.
    // 도착 판정·리뷰 제안은 그 뒤 지도 위에서 이어진다.
    const end = KakaoNavi.addListener('onGuideEnd', () => {
      router.navigate('/');
      void (async () => {
        const effPid = goalOverride ? goalOverride.placeId : pid;
        const effCid = goalOverride ? undefined : cid;
        const effLat = goalOverride?.lat ?? goalLat;
        const effLng = goalOverride?.lng ?? goalLng;
        const effName = goalOverride?.name ?? goalName;
        if (!effPid && !effCid) return;
        let near = false;
        try {
          const pos =
            (await Location.getLastKnownPositionAsync()) ??
            (await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }));
          near =
            haversine(
              { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
              { latitude: effLat, longitude: effLng },
            ) < 400;
        } catch {
          // 위치를 못 읽으면 조용히 넘어간다 — 제안을 못 띄울 뿐
        }
        if (!near) return;
        // 네이티브 닫힘 애니메이션이 끝난 뒤 지도 위에서 띄운다
        setTimeout(() => {
          Alert.alert(`${effName} 도착!`, '어떠셨나요? 리뷰를 남겨보세요.', [
            { text: '나중에', style: 'cancel' },
            {
              text: '리뷰 남기기',
              onPress: () => {
                if (effPid) {
                  focusPlaceOnMap(effPid); // 장소 시트로 — 리뷰 작성이 그 안에 있다
                } else if (effCid) {
                  router.push(`/course/${effCid}`); // 코스 리뷰 폼은 코스 상세에
                }
              },
            },
          ]);
        }, 500);
      })();
    });
    const failed = KakaoNavi.addListener('onGuideFailed', ({ message }) => {
      setStarting(false);
      toast.error('길안내를 시작할 수 없습니다', message);
    });
    return () => {
      end.remove();
      failed.remove();
    };
  }, [router, pid, cid, goalLat, goalLng, goalName, goalOverride]);

  // 안내 화면 메뉴 버튼 — 위험 제보(100) · 근처 장소(101).
  // 화면은 네이티브가 덮고 있으므로 UI 는 네이티브 액션시트로, 데이터는 여기서 처리한다.
  useEffect(() => {
    const reportHazard = async () => {
      const picked = await KakaoNavi.showGuideOptions(
        '노면 위험 제보',
        HAZARD_LIST.map((h) => h.label),
      );
      if (picked < 0) return;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await submitHazard({
          type: HAZARD_LIST[picked].key,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        void KakaoNavi.showGuideNotice('제보했어요. 안전 운행하세요!');
      } catch {
        void KakaoNavi.showGuideNotice('제보하지 못했어요. 로그인 상태를 확인해주세요.');
      }
    };

    const nearbyPlaces = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const places = (await fetchNearbyPlaces({ ...here, radiusMeters: 5000 }))
          .map((p) => ({ ...p, dist: haversine(here, p) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 5);
        if (places.length === 0) {
          void KakaoNavi.showGuideNotice('5km 안에 등록된 장소가 없어요.');
          return;
        }
        const picked = await KakaoNavi.showGuideOptions(
          '근처 라이더 장소로 안내',
          places.map((p) => `${p.name} · ${formatMeters(p.dist)}`),
        );
        if (picked < 0) return;
        const target = places[picked];
        await KakaoNavi.changeGuideDestination(
          target.longitude,
          target.latitude,
          target.name,
          priority,
        );
        setGoalOverride({
          lng: target.longitude,
          lat: target.latitude,
          name: target.name,
          placeId: target.id,
        });
        void KakaoNavi.showGuideNotice(`${target.name}(으)로 안내를 변경했어요.`);
      } catch {
        void KakaoNavi.showGuideNotice('목적지를 변경하지 못했어요.');
      }
    };

    // 커스텀 슬롯이 하나뿐이라 버튼 하나에서 1차 시트로 가른다
    const menu = KakaoNavi.addListener('onGuideMenu', ({ id }) => {
      if (id !== 100) return;
      void (async () => {
        const picked = await KakaoNavi.showGuideOptions('모토맵', [
          '위험 제보',
          '근처 장소로 안내',
        ]);
        if (picked === 0) await reportHazard();
        else if (picked === 1) await nearbyPlaces();
      })();
    });
    return () => menu.remove();
  }, [priority]);

  // 출발지 확보 — 지정돼 있으면 그대로, 아니면 현재 위치
  useEffect(() => {
    if (slng && slat) {
      setStart([Number(slng), Number(slat)]);
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
      const requestVias = activeVias ?? effVias;
      // 실패 시 경유지를 줄여가며 재시도하는 사다리. 20413(도로 자체가 안 이어짐)은
      // 경유지를 줄여도 소용없으니 바로 중단한다.
      const flatSample = (flat: number[], n: number): number[] => {
        const pairs: [number, number][] = [];
        for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
        if (pairs.length <= n) return flat;
        const [first, ...rest] = pairs;
        const picked = [first];
        for (let i = 0; i < n - 1; i++) {
          picked.push(rest[Math.round(((i + 1) * rest.length) / (n - 1)) - 1]);
        }
        return picked.flat();
      };
      const pairCount = requestVias.length / 2;
      const ladder = [pairCount, 12, 5, 1, 0]
        .filter((n, i, arr) => n <= pairCount && arr.indexOf(n) === i)
        .map((n) => (n === 0 ? [] : flatSample(requestVias, n)));

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
          if (String((err as any)?.message ?? err).includes('20413')) break;
        }
      }
      if (cancelled) return;

      // 현재 위치 출발이 막히고 경유지가 있으면(코스 안내) 코스 출발지 기준으로 재시도
      if (!courseOnly && !slng && flatVias.length >= 2) {
        setRoutes({});
        setCourseOnly(true);
        toast.info('코스 출발지 기준으로 보여드려요', '현재 위치에서 이어지는 도로가 없어요.');
        return;
      }
      toast.error('경로를 찾을 수 없습니다', friendlyRouteError(lastErr));
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effVias 는 vias 문자열·courseOnly 에서 파생
  }, [effStart?.[0], effStart?.[1], priority, routes, goalLng, goalLat, vias, courseOnly, activeVias]);

  // 경로가 바뀌면 전체가 보이도록 카메라를 맞춘다.
  // 남쪽은 하단 카드가 덮는 만큼 더 벌린다.
  useEffect(() => {
    if (!route || route.polyline.length < 4) return;
    const lngs: number[] = [];
    const lats: number[] = [];
    for (let i = 0; i < route.polyline.length; i += 2) {
      lngs.push(route.polyline[i]);
      lats.push(route.polyline[i + 1]);
    }
    const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 0.01);
    const lngSpan = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.01);
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: {
        latitude: Math.min(...lats) - latSpan * 0.45,
        longitude: Math.min(...lngs) - lngSpan * 0.1,
      },
      coord2: {
        latitude: Math.max(...lats) + latSpan * 0.1,
        longitude: Math.max(...lngs) + lngSpan * 0.1,
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

  const coords =
    route && route.polyline.length >= 4
      ? Array.from({ length: route.polyline.length / 2 }, (_, i) => ({
          longitude: route.polyline[i * 2],
          latitude: route.polyline[i * 2 + 1],
        }))
      : null;

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
        {coords && (
          <NaverMapPathOverlay
            coords={coords}
            width={6}
            color={semantic.success}
            outlineWidth={2}
            outlineColor="#FFFFFF"
          />
        )}
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
          {goalOverride?.name ?? goalName}
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

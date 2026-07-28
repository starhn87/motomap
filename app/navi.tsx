import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

// 길안내 진입 화면 — 경로 미리보기와 옵션 선택을 겸한다.
// 옵션별 경로를 지도에 그려 보여주고, 고르면 그 옵션으로 KNSDK 안내를 시작한다.
// 미리보기도 안내와 같은 KNSDK 엔진을 쓰므로 여기서 본 경로가 곧 안내 경로다.
export default function NaviScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { lng, lat, name } = useLocalSearchParams<{
    lng: string;
    lat: string;
    name?: string;
  }>();

  const mapRef = useRef<NaverMapViewRef>(null);
  const [start, setStart] = useState<[number, number] | null>(null); // [lng, lat]
  const [priority, setPriority] = useState<RoutePriority>(0);
  const [routes, setRoutes] = useState<Partial<Record<RoutePriority, BikeRoute>>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const goalLng = Number(lng);
  const goalLat = Number(lat);
  const goalName = name ?? '목적지';
  const route = routes[priority];

  // 안내 종료·실패 이벤트 — 안내는 네이티브 전체화면이라 이벤트로만 돌아온다
  useEffect(() => {
    const end = KakaoNavi.addListener('onGuideEnd', () => router.back());
    const failed = KakaoNavi.addListener('onGuideFailed', ({ message }) => {
      setStarting(false);
      toast.error('길안내를 시작할 수 없습니다', message);
    });
    return () => {
      end.remove();
      failed.remove();
    };
  }, [router]);

  // 출발지(현재 위치) 확보
  useEffect(() => {
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
  }, [router]);

  // 선택된 옵션의 경로 확보 (옵션별 캐시)
  useEffect(() => {
    if (!start || routes[priority]) return;
    let cancelled = false;
    setLoading(true);
    KakaoNavi.requestBikeRoute(start[0], start[1], goalLng, goalLat, priority)
      .then((result) => {
        if (cancelled) return;
        setRoutes((prev) => ({ ...prev, [priority]: result }));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error('경로를 찾을 수 없습니다', String(err?.message ?? err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, priority, routes, goalLng, goalLat]);

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
    if (!start || starting) return;
    setStarting(true);
    KakaoNavi.startGuide(start[0], start[1], goalLng, goalLat, goalName, priority).catch(
      (err) => {
        setStarting(false);
        toast.error('길안내를 시작할 수 없습니다', String(err?.message ?? err));
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

        <View style={styles.infoRow}>
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
          disabled={!route || starting}
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: colors.tint,
              opacity: !route || starting ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          {starting ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={[styles.startLabel, { color: colors.background }]}>
              안내 시작
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

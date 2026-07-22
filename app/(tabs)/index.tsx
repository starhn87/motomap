import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { NaverMapView, NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useMapStore } from '@/stores/useMapStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePlaces } from '@/hooks/usePlaces';
import { useGasStations, GAS_MIN_ZOOM, type SearchPoint } from '@/hooks/useGasStations';
import { useWeather } from '@/hooks/useWeather';
import { useUnreadCount } from '@/hooks/useNotifications';
import { fetchPlaceById } from '@/hooks/usePlace';
import { useUserLocation } from '@/hooks/useUserLocation';
import { fetchRoute } from '@/lib/api/directions';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryFilter from '@/components/map/CategoryFilter';
import { MARKER_IMAGES } from '@/constants/markerImages';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import GasStationMarker from '@/components/map/GasStationMarker';
import GasStationCard from '@/components/map/GasStationCard';
import WeatherFab from '@/components/map/WeatherFab';
import WeatherSheet from '@/components/map/WeatherSheet';
import RouteLine from '@/components/map/RouteLine';
import RouteInfoCard from '@/components/map/RouteInfoCard';
import TempPlaceSheet, { type TempPlace } from '@/components/map/TempPlaceSheet';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import { coordToSpot, coordToAddress, nearestPoi, searchKakaoLocal } from '@/lib/api/kakaoLocal';
import * as Updates from 'expo-updates';
import SearchEntry from '@/components/search/SearchEntry';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { UserLocationMarker } from '@/components/map/UserLocationMarker';
import { LocationPulse } from '@/components/map/LocationPulse';
import { toast } from '@/lib/toast';
import type { Place } from '@/types';
import type { Route } from '@/lib/api/directions';
import type { GasStation } from '@/lib/api/gasStations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// 이 빌드(runtime)에 네이버 심벌 탭 네이티브 이벤트(onTapSymbol 패치)가 포함됐는지 —
// 1.1.3 빌드부터 포함. 구 빌드는 이벤트가 안 오므로 지도 탭의 카카오 근사로 폴백한다.
const SYMBOL_TAP_NATIVE = (() => {
  const v = (Updates.runtimeVersion ?? '').split('.').map(Number);
  const min = [1, 1, 3];
  for (let i = 0; i < 3; i++) {
    if ((v[i] ?? 0) > min[i]) return true;
    if ((v[i] ?? 0) < min[i]) return false;
  }
  return true;
})();

// 짧은 거리 근사(m) — 재검색 버튼 노출 판정용 (한국 위도대 경도 1도 ≈ 88km)
function approxMeters(a: SearchPoint, b: SearchPoint): number {
  return Math.hypot((a.latitude - b.latitude) * 111000, (a.longitude - b.longitude) * 88000);
}

// 장소 선택 시 하단 시트(첫 스냅 28%)가 마커를 가리지 않도록 카메라 중심을 남쪽으로
// 내려 마커를 화면 중심 살짝 위(≈45% 지점)에 둔다 — 상단 검색바·카테고리(≈18%)와
// 시트 위 경계(72%) 사이의 중앙. 웹 머카토르 근사: 화면 높이 비율 → 위도.
function sheetLatOffset(zoom: number, screenHeightDp: number, lat: number): number {
  const latSpan =
    (screenHeightDp / (256 * Math.pow(2, zoom))) * 360 * Math.cos((lat * Math.PI) / 180);
  return latSpan * 0.05;
}

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { userLocation, selectedPlaceId, activeFilter, setSelectedPlaceId } =
    useMapStore();
  const authedUser = useAuthStore((s) => s.user);
  const unreadCount = useUnreadCount();
  const { heading } = useUserLocation();

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routePlace, setRoutePlace] = useState<Place | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [pulse, setPulse] = useState<{ x: number; y: number; id: number } | null>(null);
  const pulseIdRef = useRef(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);
  const mapRef = useRef<NaverMapViewRef>(null);
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const didCenterOnUserRef = useRef(false);

  // 주유소 필터는 DB 대신 오피넷 실시간 유가 레이어를 켠다.
  // 지도 이동에 연동하지 않는 수동 갱신 모델 — 필터 진입 시 1회 검색하고, 이후에는
  // "현 지도에서 재검색" 버튼으로만 기준점을 옮긴다 (최저가 표시 고정 + 호출 절약).
  const gasMode = activeFilter === 'gas_station';
  const gasZoomOk = (mapCenter?.zoom ?? DEFAULT_ZOOM) >= GAS_MIN_ZOOM;
  const [selectedStation, setSelectedStation] = useState<GasStation | null>(null);
  const [gasSearchPoint, setGasSearchPoint] = useState<SearchPoint | null>(null);

  const { data: supabasePlaces } = usePlaces(activeFilter, mapCenter, !gasMode);
  const { data: gasStations, isFetching: gasFetching } = useGasStations(
    gasSearchPoint,
    gasMode && mapReady,
  );

  // 라이딩 날씨 — 내 위치 우선, 없으면 지도 중심 기준
  const weatherLat = userLocation?.latitude ?? mapCenter?.latitude;
  const weatherLng = userLocation?.longitude ?? mapCenter?.longitude;
  const { data: weather, refetch: refetchWeather } = useWeather(weatherLat, weatherLng);
  const [weatherOpen, setWeatherOpen] = useState(false);

  // 시트를 여는 순간엔 캐시 신선도와 무관하게 서버에 재확인한다 — 발표분이 바뀌었으면
  // 즉시 반영되고, 같으면 EF 캐시가 같은 값을 돌려주므로 비용도 없다
  useEffect(() => {
    if (weatherOpen) void refetchWeather();
  }, [weatherOpen, refetchWeather]);

  // 필터 진입 시 현재 지도 중심으로 최초 1회 검색, 필터를 벗어나면 초기화
  useEffect(() => {
    if (!gasMode) {
      setSelectedStation(null);
      setGasSearchPoint(null);
      return;
    }
    if (!gasSearchPoint && mapCenter && gasZoomOk) {
      setGasSearchPoint({ latitude: mapCenter.latitude, longitude: mapCenter.longitude });
    }
  }, [gasMode, gasSearchPoint, mapCenter, gasZoomOk]);

  // 최초 1회: 지도가 준비되고 내 위치를 확보하면 카메라를 내 위치로 이동
  useEffect(() => {
    if (!mapReady || !userLocation || didCenterOnUserRef.current) return;
    didCenterOnUserRef.current = true;
    mapRef.current?.animateCameraTo({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      zoom: DEFAULT_ZOOM,
      duration: 0,
    });
  }, [mapReady, userLocation]);

  // 언마운트 시 카메라/펄스 타이머 정리
  useEffect(() => {
    return () => {
      if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const places = gasMode ? [] : (supabasePlaces ?? []);
  // 검색된 마커는 줌아웃해도 유지한다 — 기준점(gasSearchPoint)이 바뀔 때만 갱신
  const stations = gasMode ? (gasStations ?? []) : [];
  // 최저가 표시는 딱 하나 — 가격순(sort=1) 응답에서 최저가와 동가인 것 중 가장 가까운 곳
  const cheapestId = stations.length
    ? stations
        .filter((s) => s.price === stations[0].price)
        .reduce((a, b) => (a.distance <= b.distance ? a : b)).id
    : null;
  // 기준점에서 지도를 충분히 움직였을 때만 재검색 버튼 노출
  const gasMoved =
    gasMode && gasSearchPoint && mapCenter ? approxMeters(mapCenter, gasSearchPoint) > 300 : false;
  const showGasRefresh = gasMode && gasZoomOk && !!gasSearchPoint && (gasMoved || gasFetching);

  const handleMarkerPress = useCallback(
    (place: Place) => {
      if (navigating) return;
      setHighlightReview(null);
      setTempPlace(null);
      setSelectedPlaceId(place.id);
      setSelectedPlace(place);
      // 현재 줌을 유지한 채 마커가 시트에 가리지 않는 위치로 카메라만 보정
      const zoom = mapCenter?.zoom ?? DEFAULT_ZOOM;
      mapRef.current?.animateCameraTo({
        latitude: place.latitude - sheetLatOffset(zoom, screenHeight, place.latitude),
        longitude: place.longitude,
        zoom,
        duration: 400,
      });
    },
    [setSelectedPlaceId, navigating, mapCenter, screenHeight]
  );

  const handleSearchSelect = useCallback(
    (place: Place) => {
      setSelectedPlaceId(place.id);
      setSelectedPlace(place);
      mapRef.current?.animateCameraTo({
        latitude: place.latitude - sheetLatOffset(15, screenHeight, place.latitude),
        longitude: place.longitude,
        zoom: 15,
        duration: 800,
      });
    },
    [setSelectedPlaceId, screenHeight]
  );

  // 승인 푸시 탭·검색 화면 선택 → focusPlaceId 파라미터로 진입 시 해당 장소를 선택·포커스.
  // 같은 장소를 연속 선택해도 반응하도록 focusTs(검색 화면이 넣어줌)까지 포함해 중복 판정한다.
  // focusReviewId(내 리뷰에서 진입)가 있으면 시트를 펼쳐 그 리뷰로 스크롤·강조한다.
  const { focusPlaceId, focusTs, focusReviewId, kakaoName, kakaoAddress, kakaoLat, kakaoLng, kakaoPhone } =
    useLocalSearchParams<{
      focusPlaceId?: string;
      focusTs?: string;
      focusReviewId?: string;
      kakaoName?: string;
      kakaoAddress?: string;
      kakaoLat?: string;
      kakaoLng?: string;
      kakaoPhone?: string;
    }>();
  // 검색의 "일반 장소"(카카오 로컬) 선택 — DB 에 없는 임시 목적지
  const [tempPlace, setTempPlace] = useState<TempPlace | null>(null);
  const handledKakaoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!kakaoName || !kakaoLat || !kakaoLng || !mapReady) return;
    const key = `${kakaoName}-${focusTs ?? ''}`;
    if (handledKakaoRef.current === key) return;
    handledKakaoRef.current = key;
    const place: TempPlace = {
      name: kakaoName,
      address: kakaoAddress ?? '',
      latitude: Number(kakaoLat),
      longitude: Number(kakaoLng),
      phone: kakaoPhone || undefined,
    };
    setSelectedPlaceId(null);
    setSelectedPlace(null);
    setTempPlace(place);
    mapRef.current?.animateCameraTo({
      latitude: place.latitude,
      longitude: place.longitude,
      zoom: 15,
      duration: 800,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoName, kakaoAddress, kakaoLat, kakaoLng, kakaoPhone, focusTs, mapReady]);
  const [highlightReview, setHighlightReview] = useState<{ id: string; key: string } | null>(
    null
  );
  const handledFocusIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusPlaceId || !mapReady) return;
    const focusKey = `${focusPlaceId}-${focusTs ?? ''}`;
    if (handledFocusIdRef.current === focusKey) return;
    handledFocusIdRef.current = focusKey;
    let cancelled = false;
    (async () => {
      const place = await fetchPlaceById(focusPlaceId);
      if (place && !cancelled) {
        setHighlightReview(focusReviewId ? { id: focusReviewId, key: focusKey } : null);
        handleSearchSelect(place);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusPlaceId, focusTs, focusReviewId, mapReady, handleSearchSelect]);

  const handleBottomSheetClose = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedPlace(null);
    setHighlightReview(null);
    // ✕/뒤로가기는 시트를 닫힘 애니메이션 없이 언마운트시켜 position 이 확장 값에
    // 동결된다(버튼 실종) — 닫힘 위치로 부드럽게 복귀시킨다. 스와이프 닫기처럼 이미
    // 닫힘 값에 도달한 경우엔 사실상 no-op 이다.
    sheetPosition.value = withTiming(containerHeight.value + 100, { duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedPlaceId]);

  const handleRoutePreview = useCallback(
    async (place: Place) => {
      if (!userLocation) {
        toast.info('현재 위치를 확인할 수 없습니다.');
        return;
      }

      try {
        const result = await fetchRoute(
          [userLocation.longitude, userLocation.latitude],
          [place.longitude, place.latitude]
        );

        setRoute(result);
        setRoutePlace(place);
        setNavigating(true);
        setSelectedPlace(null);
        setSelectedPlaceId(null);
        // 시트가 언마운트되며 위치 값이 중간에 남지 않도록 닫힘 위치로 부드럽게 복귀
        sheetPosition.value = withTiming(containerHeight.value + 100, { duration: 250 });

        if (result.geometry.length > 0) {
          const lngs = result.geometry.map((c) => c[0]);
          const lats = result.geometry.map((c) => c[1]);

          mapRef.current?.animateCameraTo({
            latitude: (Math.max(...lats) + Math.min(...lats)) / 2,
            longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2,
            zoom: 10,
            duration: 1000,
          });
        }
      } catch (error: any) {
        toast.error('경로를 찾을 수 없습니다.', error.message);
      }
    },
    [userLocation, setSelectedPlaceId]
  );

  const handleRouteClose = useCallback(() => {
    setRoute(null);
    setRoutePlace(null);
    setNavigating(false);
  }, []);

  const handleMapTap = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    Keyboard.dismiss();
    // 1단계: 열려 있는 카드·시트가 있으면 닫기만 한다 (지도 앱 관례)
    if (selectedPlace || selectedStation || tempPlace) {
      if (selectedPlace) handleBottomSheetClose();
      if (selectedStation) setSelectedStation(null);
      if (tempPlace) setTempPlace(null);
      return;
    }
    // 2단계: 아무것도 없으면 탭 지점을 조회해 임시 카드를 띄운다.
    // 근처에 지도 심볼로 뜨는 POI가 있으면 그 장소(좌표 포함)로 스냅하고,
    // 없을 때만 주소·건물명으로 폴백. 주유소 모드·내비 중엔 방해라 생략.
    if (gasMode || navigating) return;
    // 심볼 아이콘만이 아니라 그 아래 이름 라벨을 탭해도 같은 POI로 잡는다 —
    // 심볼은 항상 이름보다 위(북쪽)에 그려지므로 검색 중심을 화면 10px 상당
    // 북쪽으로 올리고, 반경은 줌에 따른 화면 22px 상당(35~70m)으로 잡는다.
    // 심볼이 그려지지 않는 저줌(<14)에서는 스냅이 오탐만 만들므로 주소 폴백만 쓴다.
    const zoom = mapCenter?.zoom ?? DEFAULT_ZOOM;
    const mPerPx = (156543.04 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
    const searchLat = latitude + (10 * mPerPx) / 111320;
    const radius = Math.min(70, Math.max(35, Math.round(22 * mPerPx)));
    void (async () => {
      const [poi, spot] = await Promise.all([
        zoom >= 14 && !SYMBOL_TAP_NATIVE
          ? nearestPoi(searchLat, longitude, radius)
          : Promise.resolve(null),
        coordToSpot(latitude, longitude),
      ]);
      if (poi) {
        setTempPlace({
          name: poi.placeName,
          address: poi.roadAddress || poi.address,
          latitude: poi.latitude,
          longitude: poi.longitude,
          phone: poi.phone || undefined,
        });
        return;
      }
      if (!spot) return;
      setTempPlace({
        name: spot.buildingName ?? '선택한 위치',
        address: spot.address,
        latitude,
        longitude,
      });
    })();
  };

  // 네이버 지도가 그린 심벌(장소 아이콘·이름)을 탭 — 패치된 네이티브 이벤트라
  // 이름·좌표가 정확하다. 주소만 역지오코딩으로 뒤에서 채운다.
  const handleSymbolTap = ({
    latitude,
    longitude,
    caption,
  }: {
    latitude: number;
    longitude: number;
    caption: string;
  }) => {
    Keyboard.dismiss();
    // 주유소 모드·내비 중엔 새 카드를 띄우지 않고 열려 있는 것만 닫는다
    if (gasMode || navigating) {
      if (selectedPlace) handleBottomSheetClose();
      if (selectedStation) setSelectedStation(null);
      if (tempPlace) setTempPlace(null);
      return;
    }
    // 다른 카드·시트가 열려 있어도 닫기 없이 새 심벌로 바로 전환한다 (지도 앱 관례)
    if (selectedPlace) handleBottomSheetClose();
    if (selectedStation) setSelectedStation(null);
    setTempPlace({ name: caption, address: '', latitude, longitude });
    void coordToAddress(latitude, longitude).then((address) => {
      if (!address) return;
      setTempPlace((prev) =>
        prev && prev.name === caption && prev.latitude === latitude
          ? { ...prev, address }
          : prev,
      );
    });
    // 전화번호는 심벌 이벤트에 없다 — 이름으로 검색해 같은 자리(150m 이내) 결과에서 채운다
    void searchKakaoLocal(caption).then((results) => {
      const match = results.find(
        (r) =>
          r.phone &&
          Math.hypot((r.latitude - latitude) * 111000, (r.longitude - longitude) * 88000) < 150,
      );
      if (!match) return;
      setTempPlace((prev) =>
        prev && prev.name === caption && prev.latitude === latitude
          ? { ...prev, phone: match.phone }
          : prev,
      );
    });
  };

  // 탭바와 같은 프레스 감각 — 누르는 동안 움츠리고 떼면 한 번만 튕기며 복귀
  const myLocationScale = useSharedValue(1);
  const myLocationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: myLocationScale.value }],
  }));

  // 내 위치 버튼이 장소 시트의 실시간 위치를 따라 위로 밀려난다 (시트 위 16px).
  // 시트가 끝까지(100% 근처) 올라가면 페이드아웃. 닫히면 기본 위치로 자연 복귀.
  const sheetPosition = useSharedValue(999999);
  const containerHeight = useSharedValue(0);
  const myLocationFollowStyle = useAnimatedStyle(() => {
    const base = navigating ? 200 : 24;
    const h = containerHeight.value;
    const fromSheet = h > 0 ? h - sheetPosition.value + 16 : 0;
    return {
      bottom: Math.max(base, fromSheet),
      opacity:
        h > 0
          ? interpolate(sheetPosition.value, [h * 0.2, h * 0.35], [0, 1], Extrapolation.CLAMP)
          : 1,
    };
  });
  const handleMyLocationPressIn = () => {
    myLocationScale.value = withTiming(0.85, { duration: 90 });
  };
  const handleMyLocationPressOut = () => {
    myLocationScale.value = withSequence(
      withTiming(1.05, { duration: 100, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 90, easing: Easing.inOut(Easing.quad) }),
    );
  };

  const handleMyLocation = () => {
    if (!userLocation || !mapRef.current) return;
    // 내 위치를 지도 중앙으로 이동(현재 줌 유지)
    mapRef.current.animateCameraTo({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      zoom: mapCenter?.zoom ?? DEFAULT_ZOOM,
      duration: 600,
    });
    // 카메라 이동이 끝난 뒤 마커의 실제 화면 좌표에서 펄스 재생(중앙과 어긋나지 않게)
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(async () => {
      const res = await mapRef.current?.coordinateToScreen({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });
      pulseIdRef.current += 1;
      setPulse(
        res?.isValid
          ? { x: res.screenX, y: res.screenY, id: pulseIdRef.current }
          : { x: screenWidth / 2, y: screenHeight / 2, id: pulseIdRef.current }
      );
    }, 650);
  };

  const initialCamera = {
    latitude: userLocation?.latitude ?? DEFAULT_CENTER[1],
    longitude: userLocation?.longitude ?? DEFAULT_CENTER[0],
    zoom: DEFAULT_ZOOM,
  };

  // 선택 강조는 별도 오버레이 마커가 맡는다 — selectedPlaceId 를 의존성에서 빼서
  // 마커 탭마다 클러스터 전체가 네이티브로 재전송·재계산되는 것을 막는다.
  // 선택된 장소는 별도 선택 마커가 뜨므로 목록에서 빼서 겹침(마커 2개)을 막는다.
  const clusterMarkers = useMemo(
    () =>
      places
        .filter((place) => place.id !== selectedPlaceId)
        .map((place) => ({
          identifier: place.id,
          latitude: place.latitude,
          longitude: place.longitude,
          image: MARKER_IMAGES[place.category],
          // 이미지 하반부는 투명 여백 — 시각 크기는 36x50, 중앙 앵커에서 꼬리가 좌표를 찍는다
          width: 36,
          height: 101,
        })),
    [places, selectedPlaceId]
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        containerHeight.value = e.nativeEvent.layout.height;
      }}>
      <NaverMapView
        ref={mapRef}
        style={styles.map}
        onInitialized={() => setMapReady(true)}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass
        isShowScaleBar={false}
        isShowZoomControls={false}
        initialCamera={initialCamera}
        locale="ko"
        isExtentBoundedInKorea
        onTapMap={handleMapTap}
        onTapSymbol={handleSymbolTap}
        onCameraChanged={(e) => {
          // 사용자가 직접 지도를 움직이면(Gesture) 펄스가 마커와 어긋나므로 중단
          // (내 위치 버튼이 일으킨 이동은 'Developer'라 펄스를 유지)
          if (e.reason === 'Gesture') setPulse(null);
          if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
          cameraTimerRef.current = setTimeout(() => {
            setMapCenter({
              latitude: e.latitude,
              longitude: e.longitude,
              zoom: e.zoom ?? 12,
            });
          }, 200);
        }}
        clusters={[
          {
            markers: clusterMarkers,
            screenDistance: 70,
            minZoom: 1,
            maxZoom: 16,
            animate: true,
          },
        ]}
        onTapClusterLeaf={({ markerIdentifier }) => {
          const place = places.find((p) => p.id === markerIdentifier);
          if (place) handleMarkerPress(place);
        }}>
        {userLocation && (
          <UserLocationMarker
            latitude={userLocation.latitude}
            longitude={userLocation.longitude}
            heading={heading}
          />
        )}

        {/* 선택된 장소 강조 — 클러스터 마커 위에 같은 이미지를 크게 얹는다 */}
        {selectedPlace && (
          <NaverMapMarkerOverlay
            latitude={selectedPlace.latitude}
            longitude={selectedPlace.longitude}
            image={MARKER_IMAGES[selectedPlace.category]}
            width={47}
            height={132}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={100}
          />
        )}

        {/* 유가 마커 — 캡처된 비트맵이 재사용되므로 표시 내용(가격·최저)이 바뀌면 key 로 재캡처.
            stations 는 가격순이라 index 가 곧 겹침 생존 우선순위다 */}
        {stations.map((station, index) => (
          <GasStationMarker
            key={`${station.id}-${station.price}-${station.id === cheapestId}`}
            station={station}
            isCheapest={station.id === cheapestId}
            rank={index}
            onTap={setSelectedStation}
          />
        ))}

        {route && <RouteLine route={route} />}

        {/* 일반 장소(임시 목적지) 핀 — 카테고리 마커와 구분되는 전용 디자인 */}
        {tempPlace && (
          <TempPlaceMarker latitude={tempPlace.latitude} longitude={tempPlace.longitude} />
        )}
      </NaverMapView>

      {pulse && (
        <LocationPulse
          key={pulse.id}
          x={pulse.x}
          y={pulse.y}
          onDone={() => setPulse((cur) => (cur?.id === pulse.id ? null : cur))}
        />
      )}

      {!navigating && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={styles.searchAndFilter}>
          <View style={styles.searchRow}>
            <SearchEntry />
            {authedUser && (
              <Pressable
                onPress={() => router.push('/notifications')}
                style={[
                  styles.bellButton,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}>
                <Feather name="bell" size={20} color={colors.text} />
                {unreadCount > 0 && <View style={styles.bellDot} />}
              </Pressable>
            )}
          </View>
          <CategoryFilter />
        </Animated.View>
      )}

      {!navigating && weather && (
        <WeatherFab weather={weather} onPress={() => setWeatherOpen(true)} />
      )}

      {gasMode && !gasZoomOk && stations.length === 0 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.zoomHint, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.zoomHintText, { color: colors.text }]}>
            지도를 확대하면 주변 주유소 유가가 보여요
          </Text>
        </Animated.View>
      )}

      {showGasRefresh && (
        <AnimatedPressable
          entering={FadeIn.duration(200)}
          disabled={gasFetching}
          onPress={() => {
            if (!mapCenter) return;
            setSelectedStation(null);
            setGasSearchPoint({ latitude: mapCenter.latitude, longitude: mapCenter.longitude });
          }}
          style={[
            styles.gasRefreshButton,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <Text style={[styles.gasRefreshText, { color: colors.tint }]}>
            {gasFetching ? '검색 중...' : '↻ 현 지도에서 재검색'}
          </Text>
        </AnimatedPressable>
      )}

      <AnimatedPressable
        onPress={handleMyLocation}
        onPressIn={handleMyLocationPressIn}
        onPressOut={handleMyLocationPressOut}
        style={[
          styles.myLocationButton,
          myLocationStyle,
          myLocationFollowStyle,
          { backgroundColor: colors.background, shadowColor: '#000' },
        ]}>
        <View style={styles.myLocationIconContainer}>
          <View style={[styles.myLocationCrosshair, { borderColor: colors.tint }]}>
            <View style={[styles.myLocationCenter, { backgroundColor: colors.tint }]} />
          </View>
        </View>
      </AnimatedPressable>

      {!navigating && (
        <PlaceBottomSheet
          place={selectedPlace}
          onClose={handleBottomSheetClose}
          onRoutePreview={handleRoutePreview}
          animatedPosition={sheetPosition}
          highlightReview={highlightReview}
        />
      )}

      {tempPlace && !navigating && (
        <TempPlaceSheet place={tempPlace} onClose={() => setTempPlace(null)} />
      )}

      {navigating && route && routePlace && (
        <RouteInfoCard route={route} place={routePlace} onClose={handleRouteClose} />
      )}

      {selectedStation && (
        <GasStationCard
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}

      {weatherOpen && weather && (
        <WeatherSheet weather={weather} latitude={weatherLat} longitude={weatherLng} onClose={() => setWeatherOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  searchAndFilter: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 5,
    elevation: 5,
    gap: 0,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  zoomHint: {
    position: 'absolute',
    top: 170,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomHintText: {
    fontSize: 13,
    fontWeight: '600',
  },
  gasRefreshButton: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  gasRefreshText: {
    fontSize: 15,
    fontWeight: '700',
  },
  myLocationButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  myLocationIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationCrosshair: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

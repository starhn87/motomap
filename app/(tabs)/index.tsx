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
import { NaverMapView } from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  FadeIn,
} from 'react-native-reanimated';

import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useMapStore } from '@/stores/useMapStore';
import { usePlaces } from '@/hooks/usePlaces';
import { useGasStations, GAS_MIN_ZOOM, type SearchPoint } from '@/hooks/useGasStations';
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
import RouteLine from '@/components/map/RouteLine';
import RouteInfoCard from '@/components/map/RouteInfoCard';
import SearchBar from '@/components/search/SearchBar';
import { UserLocationMarker } from '@/components/map/UserLocationMarker';
import { LocationPulse } from '@/components/map/LocationPulse';
import { toast } from '@/lib/toast';
import type { Place } from '@/types';
import type { Route } from '@/lib/api/directions';
import type { GasStation } from '@/lib/api/gasStations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// 짧은 거리 근사(m) — 재검색 버튼 노출 판정용 (한국 위도대 경도 1도 ≈ 88km)
function approxMeters(a: SearchPoint, b: SearchPoint): number {
  return Math.hypot((a.latitude - b.latitude) * 111000, (a.longitude - b.longitude) * 88000);
}

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { userLocation, selectedPlaceId, activeFilter, setSelectedPlaceId } =
    useMapStore();
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
      setSelectedPlaceId(place.id);
      setSelectedPlace(place);
    },
    [setSelectedPlaceId, navigating]
  );

  const handleSearchSelect = useCallback(
    (place: Place) => {
      setSelectedPlaceId(place.id);
      setSelectedPlace(place);
      mapRef.current?.animateCameraTo({
        latitude: place.latitude,
        longitude: place.longitude,
        zoom: 15,
        duration: 800,
      });
    },
    [setSelectedPlaceId]
  );

  // 승인 푸시 탭 → focusPlaceId 파라미터로 진입 시 해당 장소를 선택·포커스
  const { focusPlaceId } = useLocalSearchParams<{ focusPlaceId?: string }>();
  const handledFocusIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusPlaceId || !mapReady) return;
    if (handledFocusIdRef.current === focusPlaceId) return;
    handledFocusIdRef.current = focusPlaceId;
    let cancelled = false;
    (async () => {
      const place = await fetchPlaceById(focusPlaceId);
      if (place && !cancelled) handleSearchSelect(place);
    })();
    return () => {
      cancelled = true;
    };
  }, [focusPlaceId, mapReady, handleSearchSelect]);

  const handleBottomSheetClose = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedPlace(null);
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

  const handleMapTap = () => {
    Keyboard.dismiss();
    if (selectedPlace) {
      setSelectedPlaceId(null);
      setSelectedPlace(null);
    }
    if (selectedStation) setSelectedStation(null);
  };

  const myLocationScale = useSharedValue(1);
  const myLocationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: myLocationScale.value }],
  }));

  const handleMyLocation = () => {
    myLocationScale.value = withSpring(0.85, {}, () => {
      myLocationScale.value = withSpring(1);
    });
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

  const clusterMarkers = useMemo(
    () =>
      places.map((place) => ({
        identifier: place.id,
        latitude: place.latitude,
        longitude: place.longitude,
        image: MARKER_IMAGES[place.category],
        width: selectedPlaceId === place.id ? 52 : 40,
        height: selectedPlaceId === place.id ? 52 : 40,
      })),
    [places, selectedPlaceId]
  );

  return (
    <View style={styles.container}>
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

        {/* 유가 마커 — 캡처된 비트맵이 재사용되므로 표시 내용(가격·최저)이 바뀌면 key 로 재캡처 */}
        {stations.map((station) => (
          <GasStationMarker
            key={`${station.id}-${station.price}-${station.id === cheapestId}`}
            station={station}
            isCheapest={station.id === cheapestId}
            onTap={setSelectedStation}
          />
        ))}

        {route && <RouteLine route={route} />}
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
          <SearchBar onSelectPlace={handleSearchSelect} />
          <CategoryFilter />
        </Animated.View>
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
            styles.zoomHint,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <Text style={[styles.zoomHintText, { color: colors.tint }]}>
            {gasFetching ? '검색 중...' : '↻ 현 지도에서 재검색'}
          </Text>
        </AnimatedPressable>
      )}

      <AnimatedPressable
        onPress={handleMyLocation}
        style={[
          styles.myLocationButton,
          myLocationStyle,
          {
            backgroundColor: colors.background,
            shadowColor: '#000',
            bottom: navigating ? 200 : selectedPlace ? 260 : selectedStation ? 280 : 80,
          },
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
        />
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

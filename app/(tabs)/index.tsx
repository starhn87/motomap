import {
  StyleSheet,
  View,
  Pressable,
  Text,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  NaverMapView,
  NaverMapMarkerOverlay,
} from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import * as Location from 'expo-location';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  useSharedValue,
  runOnJS,
  FadeIn,
} from 'react-native-reanimated';

import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useMapStore } from '@/stores/useMapStore';
import { usePlaces } from '@/hooks/usePlaces';
import { fetchRoute } from '@/lib/api/directions';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryFilter from '@/components/map/CategoryFilter';
import { MARKER_IMAGES } from '@/constants/markerImages';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import RouteLine from '@/components/map/RouteLine';
import RouteInfoCard from '@/components/map/RouteInfoCard';
import SearchBar from '@/components/search/SearchBar';
import { toast } from '@/lib/toast';
import type { Place } from '@/types';
import type { Route } from '@/lib/api/directions';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// 내 위치 마커 색상 (네이버 블루 기반, 테마 tint와 무관하게 고정)
const USER_LOCATION_BLUE = '#2D8CFF';
const USER_LOCATION_HALO = 'rgba(45, 140, 255, 0.18)';
const USER_LOCATION_PULSE = 'rgba(45, 140, 255, 0.55)';
const PULSE_SIZE = 40;
const PULSE_COUNT = 3;
const PULSE_DURATION = 1600;
const PULSE_STAGGER = 1300;

// 한 개의 퍼지는 링. delay만큼 늦게 시작한다.
function PulseRing({
  x,
  y,
  delay,
  onDone,
}: {
  x: number;
  y: number;
  delay: number;
  onDone?: () => void;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: PULSE_DURATION }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    // 링 안쪽 가장자리가 점 외경(지름 18) 바로 바깥에서 시작해 화살표 끝/halo(지름 40)까지 퍼진다
    transform: [{ scale: 0.55 + progress.value * 0.45 }],
    opacity: progress.value === 0 ? 0 : 1 - progress.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.userLocationPulse,
        { left: x - PULSE_SIZE / 2, top: y - PULSE_SIZE / 2 },
        animatedStyle,
      ]}
    />
  );
}

// 내 위치 탭 시 PULSE_COUNT개의 링이 순차로 퍼진다. 마커는 정적 비트맵으로
// 캡처되므로 마커 밖(지도 위 화면 좌표)에서 RN 뷰로 애니메이션한다.
function LocationPulse({
  x,
  y,
  onDone,
}: {
  x: number;
  y: number;
  onDone: () => void;
}) {
  return (
    <>
      {Array.from({ length: PULSE_COUNT }, (_, i) => (
        <PulseRing
          key={i}
          x={x}
          y={y}
          delay={i * PULSE_STAGGER}
          onDone={i === PULSE_COUNT - 1 ? onDone : undefined}
        />
      ))}
    </>
  );
}

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const {
    userLocation,
    selectedPlaceId,
    activeFilter,
    setUserLocation,
    setSelectedPlaceId,
  } = useMapStore();

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routePlace, setRoutePlace] = useState<Place | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [heading, setHeading] = useState<number>(0);
  const [pulse, setPulse] = useState<{ x: number; y: number; id: number } | null>(null);
  const pulseIdRef = useRef(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);
  const mapRef = useRef<NaverMapViewRef>(null);
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const didCenterOnUserRef = useRef(false);

  const { data: supabasePlaces } = usePlaces(activeFilter, mapCenter);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // 캐시된 마지막 위치를 먼저 반영해 초기 지도 위치를 빠르게 내 위치로 맞춘다
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        setUserLocation({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        });
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
        },
        (loc) => {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );

      headingSub = await Location.watchHeadingAsync((h) => {
        // 진북을 구할 수 없으면 trueHeading이 -1이므로 자북 기준값으로 폴백
        setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
      });
    })();

    return () => {
      locationSub?.remove();
      headingSub?.remove();
    };
  }, [setUserLocation]);

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

  const places = supabasePlaces ?? [];

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
  };

  const myLocationScale = useSharedValue(1);
  const myLocationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: myLocationScale.value }],
  }));

  const handleMyLocation = async () => {
    myLocationScale.value = withSpring(0.85, {}, () => {
      myLocationScale.value = withSpring(1);
    });
    if (!userLocation || !mapRef.current) return;
    // 줌·중심을 건드리지 않고, 내 위치 마커의 현재 화면 좌표에서 펄스 3회 재생
    const res = await mapRef.current.coordinateToScreen({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    });
    pulseIdRef.current += 1;
    setPulse(
      res.isValid
        ? { x: res.screenX, y: res.screenY, id: pulseIdRef.current }
        : { x: screenWidth / 2, y: screenHeight / 2, id: pulseIdRef.current }
    );
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
          <NaverMapMarkerOverlay
            latitude={userLocation.latitude}
            longitude={userLocation.longitude}
            anchor={{ x: 0.5, y: 0.5 }}
            width={80}
            height={80}
            angle={heading}
            isFlatEnabled>
            <View collapsable={false} style={styles.userLocationContainer}>
              <View style={styles.userLocationHalo} />
              <View style={styles.userLocationArrowOutline} />
              <View style={styles.userLocationArrowInner} />
              <View style={styles.userLocationDot} />
            </View>
          </NaverMapMarkerOverlay>
        )}

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
          <CategoryFilter />
          <SearchBar onSelectPlace={handleSearchSelect} />
        </Animated.View>
      )}

      <AnimatedPressable
        onPress={handleMyLocation}
        style={[
          styles.myLocationButton,
          myLocationStyle,
          {
            backgroundColor: colors.background,
            shadowColor: '#000',
            bottom: navigating ? 200 : selectedPlace ? 260 : 120,
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
    gap: 8,
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
  userLocationContainer: {
    width: 80,
    height: 80,
  },
  userLocationHalo: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: USER_LOCATION_HALO,
  },
  userLocationArrowOutline: {
    position: 'absolute',
    top: 20,
    left: 33,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  userLocationArrowInner: {
    position: 'absolute',
    top: 22,
    left: 36,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: USER_LOCATION_BLUE,
  },
  userLocationDot: {
    position: 'absolute',
    top: 31,
    left: 31,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: USER_LOCATION_BLUE,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  userLocationPulse: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 3,
    borderColor: USER_LOCATION_PULSE,
  },
});

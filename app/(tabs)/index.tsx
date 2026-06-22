import {
  StyleSheet,
  View,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { useUserLocation } from '@/hooks/useUserLocation';
import { fetchRoute } from '@/lib/api/directions';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryFilter from '@/components/map/CategoryFilter';
import { MARKER_IMAGES } from '@/constants/markerImages';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import RouteLine from '@/components/map/RouteLine';
import RouteInfoCard from '@/components/map/RouteInfoCard';
import SearchBar from '@/components/search/SearchBar';
import { UserLocationMarker } from '@/components/map/UserLocationMarker';
import { LocationPulse } from '@/components/map/LocationPulse';
import { toast } from '@/lib/toast';
import type { Place } from '@/types';
import type { Route } from '@/lib/api/directions';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

  const { data: supabasePlaces } = usePlaces(activeFilter, mapCenter);

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

      <AnimatedPressable
        onPress={handleMyLocation}
        style={[
          styles.myLocationButton,
          myLocationStyle,
          {
            backgroundColor: colors.background,
            shadowColor: '#000',
            bottom: navigating ? 200 : selectedPlace ? 260 : 80,
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
    gap: 0,
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

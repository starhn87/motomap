import { StyleSheet, View, Pressable, Text, Alert, Keyboard } from 'react-native';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  NaverMapView,
  NaverMapMarkerOverlay,
} from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import * as Location from 'expo-location';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  FadeIn,
} from 'react-native-reanimated';

import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useMapStore } from '@/stores/useMapStore';
import { usePlaces } from '@/hooks/usePlaces';
import { fetchRoute } from '@/lib/api/directions';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryFilter from '@/components/map/CategoryFilter';
import PlaceMarker from '@/components/map/PlaceMarker';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import RouteLine from '@/components/map/RouteLine';
import RouteInfoCard from '@/components/map/RouteInfoCard';
import SearchBar from '@/components/search/SearchBar';
import type { Place } from '@/types';
import type { Route } from '@/lib/api/directions';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);
  const mapRef = useRef<NaverMapViewRef>(null);
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: supabasePlaces } = usePlaces(activeFilter, mapCenter);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

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
        setHeading(h.trueHeading);
      });
    })();

    return () => {
      locationSub?.remove();
      headingSub?.remove();
    };
  }, [setUserLocation]);

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
        Alert.alert('알림', '현재 위치를 확인할 수 없습니다.');
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
        Alert.alert('경로 오류', error.message ?? '경로를 찾을 수 없습니다.');
      }
    },
    [userLocation, setSelectedPlaceId]
  );

  const handleRouteClose = useCallback(() => {
    setRoute(null);
    setRoutePlace(null);
    setNavigating(false);
  }, []);

  const myLocationScale = useSharedValue(1);
  const myLocationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: myLocationScale.value }],
  }));

  const handleMyLocation = () => {
    myLocationScale.value = withSpring(0.85, {}, () => {
      myLocationScale.value = withSpring(1);
    });
    if (userLocation) {
      mapRef.current?.animateCameraTo({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        zoom: 14,
        duration: 800,
      });
    }
  };

  const initialCamera = {
    latitude: userLocation?.latitude ?? DEFAULT_CENTER[1],
    longitude: userLocation?.longitude ?? DEFAULT_CENTER[0],
    zoom: DEFAULT_ZOOM,
  };

  return (
    <View style={styles.container}>
      <NaverMapView
        ref={mapRef}
        style={styles.map}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass
        isShowScaleBar={false}
        isShowZoomControls={false}
        initialCamera={initialCamera}
        locale="ko"
        isExtentBoundedInKorea
        onTapMap={() => {
          Keyboard.dismiss();
          if (selectedPlace) {
            setSelectedPlaceId(null);
            setSelectedPlace(null);
          }
        }}
        onCameraChanged={(e) => {
          if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
          cameraTimerRef.current = setTimeout(() => {
            setMapCenter({
              latitude: e.latitude,
              longitude: e.longitude,
              zoom: e.zoom ?? 12,
            });
          }, 500);
        }}>
        {userLocation && (
          <NaverMapMarkerOverlay
            latitude={userLocation.latitude}
            longitude={userLocation.longitude}
            anchor={{ x: 0.5, y: 0.5 }}
            width={44}
            height={44}
            angle={heading}
            isFlatEnabled>
            <View collapsable={false} style={styles.userLocationContainer}>
              <View style={styles.userLocationArrow} />
              <View style={styles.userLocationMarker}>
                <View style={styles.userLocationDot} />
              </View>
            </View>
          </NaverMapMarkerOverlay>
        )}

        {places.map((place) => (
          <PlaceMarker
            key={place.id}
            place={place}
            isSelected={selectedPlaceId === place.id}
            onPress={() => handleMarkerPress(place)}
          />
        ))}

        {route && <RouteLine route={route} />}
      </NaverMapView>

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
    zIndex: 10,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(247, 115, 22, 0.5)',
    marginBottom: -3,
  },
  userLocationMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(247, 115, 22, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F97316',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
});

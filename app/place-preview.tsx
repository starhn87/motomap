import { useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NaverMapView, NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import TempPlaceSheet, { type TempPlace } from '@/components/map/TempPlaceSheet';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import { usePlace } from '@/hooks/usePlace';
import { useFavorites } from '@/hooks/useFavorites';
import { coordToAddress } from '@/lib/api/kakaoLocal';
import { MARKER_IMAGES, MARKER_IMAGES_FAV } from '@/constants/markerImages';

// 미리보기 위에 얹는 장소 상세 — 그 장소가 선택된 지도 화면을 통째로 오버레이한다.
// 미리보기 안에서 시트만 띄우면 경로 카드와 겹쳐 답답하고, 화면을 넘겼다가
// 뒤로 오면 미리보기가 경로·옵션 그대로 남는다(스택이 지켜 준다).
//
// 파라미터: placeId(등록 장소) 또는 name/lat/lng[/address/phone](일반 장소·POI)

// search-results 와 같은 실측 근사 — 시트가 덮는 만큼 마커를 위로 올린다
function sheetLatOffset(zoom: number, screenHeightDp: number, lat: number): number {
  const latSpan =
    (screenHeightDp / (256 * Math.pow(2, zoom))) * 360 * Math.cos((lat * Math.PI) / 180);
  return latSpan * 0.05;
}

const ZOOM = 15;

export default function PlacePreviewScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;

  const { placeId, name, lat, lng, address, phone } = useLocalSearchParams<{
    placeId?: string;
    name?: string;
    lat?: string;
    lng?: string;
    address?: string;
    phone?: string;
  }>();

  const { data: place } = usePlace(placeId ?? null);
  const { data: favorites } = useFavorites();

  // 카메라는 파라미터 좌표로 즉시 앉힌다. usePlace 응답을 기다렸다가는
  // initialCamera 가 폴백 좌표로 굳는다(실측 — 속리산 한복판이 나왔다).
  const paramLat = lat ? Number(lat) : undefined;
  const paramLng = lng ? Number(lng) : undefined;

  // 일반 장소 — 주소가 없으면(지도 POI) 역지오코딩으로 채운다
  const [temp, setTemp] = useState<TempPlace | null>(
    !placeId && name && lat && lng
      ? {
          name,
          address: address ?? '',
          latitude: Number(lat),
          longitude: Number(lng),
          phone: phone || undefined,
        }
      : null,
  );
  useEffect(() => {
    if (!temp || temp.address) return;
    void coordToAddress(temp.latitude, temp.longitude).then((found) => {
      if (found) setTemp((prev) => (prev ? { ...prev, address: found } : prev));
    });
  }, [temp]);

  const latitude = paramLat ?? place?.latitude ?? temp?.latitude;
  const longitude = paramLng ?? place?.longitude ?? temp?.longitude;

  return (
    <View style={styles.container}>
      <NaverMapView
        style={StyleSheet.absoluteFill}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        isShowZoomControls={false}
        locale="ko"
        locationOverlay={{ isVisible: false }}
        initialCamera={{
          latitude:
            (latitude ?? 36.5) - sheetLatOffset(ZOOM, screenH, latitude ?? 36.5),
          longitude: longitude ?? 127.8,
          zoom: ZOOM,
        }}>
        {place && (
          <NaverMapMarkerOverlay
            latitude={place.latitude}
            longitude={place.longitude}
            anchor={{ x: 0.5, y: 1 }}
            width={38}
            height={44}
            image={
              favorites?.placeIds.includes(place.id)
                ? MARKER_IMAGES_FAV[place.category]
                : MARKER_IMAGES[place.category]
            }
          />
        )}
        {temp && <TempPlaceMarker latitude={temp.latitude} longitude={temp.longitude} />}
      </NaverMapView>

      {/* 뒤로 가기 — 미리보기로 복귀. 시트 뒤에 깔리지 않게 지도 위 좌상단 */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backButton, { top: insets.top + 8, backgroundColor: colors.background }]}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      {place && <PlaceBottomSheet place={place} onClose={() => router.back()} />}
      {temp && <TempPlaceSheet place={temp} onClose={() => router.back()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
});

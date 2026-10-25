import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NaverMapView, NaverMapMarkerOverlay, type NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import CloseIcon from '@/components/ui/CloseIcon';
import { useColorScheme } from '@/components/useColorScheme';
import { coordToAddress } from '@/lib/api/kakaoLocal';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useFavoritePlaces } from '@/hooks/useFavorites';
import { MARKER_IMAGES_CIRCLE_FAV, GENERAL_MARKER_CIRCLE_FAV } from '@/constants/markerImages';
import type { NavTarget } from '@/lib/navigation';

interface Props {
  visible: boolean;
  initial?: { latitude: number; longitude: number } | null;
  allowFavorites?: boolean;
  onClose: () => void;
  onPick: (coord: { latitude: number; longitude: number; address: string | null; name?: string; placeId?: string; generalPlaceId?: string }) => void;
}

// 지도를 탭해 지점을 찍는 선택기. 중앙 고정 핀 방식은 지도를 움직일 때마다
// 역지오코딩을 부르는데, 지도는 훑어보려고 움직이는 경우가 대부분이라 헛호출이 많다.
// 탭한 순간에만 핀을 옮기고 그때 한 번 주소를 조회한다.
export default function MapPickerModal({ visible, initial, allowFavorites = false, onClose, onPick }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const { data: favorites } = useFavoritePlaces(visible && allowFavorites);
  const generation = useRef(0);
  const mapRef = useRef<NaverMapViewRef>(null);
  const mapReady = useRef(false);
  const projection = useRef(0);
  const [hitAreas, setHitAreas] = useState<(NavTarget & { address: string; x: number; y: number })[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<NavTarget | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // 열 때마다 초기 위치(현재 위치 등)에 핀을 놓고 시작한다
  useEffect(() => {
    if (!visible) { generation.current += 1; projection.current += 1; mapReady.current=false; setHitAreas([]); return; }
    generation.current += 1;
    setSelectedPlace(null);
    setResolving(false);
    setMarker(initial ?? null);
    setAddress(null);
    if (initial) void resolveAddress(initial.latitude, initial.longitude);
    return () => { generation.current += 1; projection.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => { void projectFavorites(); }, [visible, favorites, allowFavorites]);

  async function projectFavorites() {
    const map=mapRef.current, request=++projection.current;
    if (!visible || !allowFavorites || !mapReady.current || !map) { setHitAreas([]); return; }
    const points = [
      ...(favorites?.places ?? []).map(place => ({ name: place.name, latitude: place.latitude, longitude: place.longitude, placeId: place.id, address: place.address ?? '' })),
      ...(favorites?.general ?? []).map(place => ({ name: place.name, latitude: place.latitude, longitude: place.longitude, generalPlaceId: place.generalPlaceId, address: place.address })),
    ];
    const projected = await Promise.all(points.map(async point => {
      try {
        const screen=await map.coordinateToScreen(point);
        return screen.isValid ? { ...point, x: screen.screenX, y: screen.screenY } : null;
      } catch { return null; }
    }));
    if (request === projection.current) setHitAreas(projected.filter(point => point !== null));
  }

  const resolveAddress = async (latitude: number, longitude: number) => {
    const request = ++generation.current;
    setResolving(true);
    try {
      const value = await coordToAddress(latitude, longitude);
      if (request === generation.current) setAddress(value);
    } catch {
      if (request === generation.current) setAddress(null);
    } finally {
      if (request === generation.current) setResolving(false);
    }
  };

  const handleTap = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    setSelectedPlace(null);
    setMarker({ latitude, longitude });
    setAddress(null);
    void resolveAddress(latitude, longitude);
  };

  const chooseFavorite = (point: NavTarget, address: string) => {
    generation.current += 1;
    setSelectedPlace(point); setMarker(point); setAddress(address); setResolving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <NaverMapView
          ref={mapRef}
          onInitialized={() => { mapReady.current=true; void projectFavorites(); }}
          onCameraChanged={() => { projection.current += 1; setHitAreas([]); }}
          onCameraIdle={() => { void projectFavorites(); }}
          locationOverlay={{ isVisible: false }}
          style={StyleSheet.absoluteFill}
          mapType="Basic"
          isNightModeEnabled={colorScheme === 'dark'}
          isShowLocationButton={false}
          isShowCompass={false}
          isShowScaleBar={false}
          isShowZoomControls={false}
          locale="ko"
          initialCamera={{
            latitude: initial?.latitude ?? DEFAULT_CENTER[1],
            longitude: initial?.longitude ?? DEFAULT_CENTER[0],
            zoom: initial ? 16 : DEFAULT_ZOOM,
          }}
          onTapMap={handleTap}>
          {allowFavorites && favorites?.places.map(place => (
            <NaverMapMarkerOverlay key={place.id} latitude={place.latitude} longitude={place.longitude}
              image={MARKER_IMAGES_CIRCLE_FAV[place.category]} width={34} height={34}
              caption={{ text: place.name }}
              onTap={() => chooseFavorite({ name: place.name, latitude: place.latitude, longitude: place.longitude, placeId: place.id }, place.address ?? '')} />
          ))}
          {allowFavorites && favorites?.general.map(place => (
            <NaverMapMarkerOverlay key={`general-${place.id}`} latitude={place.latitude} longitude={place.longitude}
              image={GENERAL_MARKER_CIRCLE_FAV} width={34} height={34} caption={{ text: place.name }}
              onTap={() => chooseFavorite({ name: place.name, latitude: place.latitude, longitude: place.longitude, generalPlaceId: place.generalPlaceId }, place.address)} />
          ))}
          {marker && (
            <NaverMapMarkerOverlay
              latitude={marker.latitude}
              longitude={marker.longitude}
              image={require('@/assets/images/markers/general.png')}
              width={38}
              height={44}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}
        </NaverMapView>

        {/* SDK 마커 탭이 누락돼도 정지한 지도 위의 실제 터치 영역으로 선택한다. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {hitAreas.map(point => (
            <Pressable key={point.placeId ?? point.generalPlaceId ?? `${point.latitude}:${point.longitude}`}
              accessibilityRole="button" accessibilityLabel={`${point.name}, 즐겨찾기 선택`}
              onPress={() => chooseFavorite(point, point.address)}
              style={{ position: 'absolute', left: point.x-22, top: point.y-22, width: 44, height: 44 }} />
          ))}
        </View>

        <Pressable
          accessibilityLabel="위치 선택 닫기"
          accessibilityRole="button"
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [
            styles.close,
            {
              top: insets.top + 12,
              backgroundColor: colors.surfaceElevated,
              borderColor: pressed ? colors.tint : colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <CloseIcon size={20} color={colors.text} />
        </Pressable>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 16,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.address, { color: colors.text }]} numberOfLines={2}>
              {!marker
                ? '지도를 눌러 위치를 찍어주세요.'
                : resolving
                  ? '위치 확인 중…'
                  : (selectedPlace?.name ?? address ?? '주소를 찾을 수 없는 지점')}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="이 위치로 선택"
            accessibilityRole="button"
            accessibilityState={{ disabled: !marker || resolving, busy: resolving }}
            onPress={() => marker && onPick({ ...marker, ...selectedPlace, address })}
            disabled={!marker || resolving}
            style={({ pressed }) => [
              styles.confirm,
              {
                backgroundColor: colors.tint,
                opacity: !marker || resolving ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}>
            {resolving ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.confirmText, { color: colors.background }]}>이 위치로 선택</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 14,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: { flex: 1, fontSize: 15, fontWeight: '600' },
  confirm: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700' },
});

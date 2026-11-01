import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NaverMapView, NaverMapMarkerOverlay, type NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Colors from '@/constants/Colors';
import CloseIcon from '@/components/ui/CloseIcon';
import { useColorScheme } from '@/components/useColorScheme';
import { coordToAddress } from '@/lib/api/kakaoLocal';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useFavoritePlaces } from '@/hooks/useFavorites';
import { MARKER_IMAGES, MARKER_IMAGES_FAV, GENERAL_MARKER_FAV } from '@/constants/markerImages';
import { findGeneralFavorite } from '@/lib/api/favorites';
import { isInMapRenderWindow, usePlaces, type MapCenter } from '@/hooks/usePlaces';
import { usePlaceOperationalStatuses } from '@/hooks/usePlaceOperationalStatus';
import RegisteredPlaceMarkers, {
  PLACE_MARKER_GLOBAL_Z_INDEX,
  TEMPORARILY_CLOSED_MARKER_ALPHA,
  markerCaption,
} from '@/components/map/RegisteredPlaceMarkers';
import FavoritePlaceMarkers from '@/components/map/FavoritePlaceMarkers';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import TempPlaceSheet, { type TempPlace } from '@/components/map/TempPlaceSheet';
import { resolveSymbolPlace } from '@/lib/symbolPlace';
import type { NavTarget } from '@/lib/navigation';
import type { Place } from '@/types';
import type { GeneralFavorite } from '@/lib/api/favorites';

interface Props {
  visible: boolean;
  initial?: { latitude: number; longitude: number } | null;
  /** 즐겨찾기와 등록(바이크 특화) 장소 마커를 메인 지도처럼 보여 주고 선택하게 한다. */
  allowPlaces?: boolean;
  /** 확인 버튼 문구. 길찾기 지점은 '경유지 추가'처럼 지금 하는 일을 쓴다. */
  confirmLabel?: string;
  onClose: () => void;
  /** iOS: 모달이 완전히 내려간 뒤 호출된다. 고른 뒤 다른 화면으로 넘어가는 일은 여기서 한다. */
  onDismiss?: () => void;
  onPick: (coord: { latitude: number; longitude: number; address: string | null; name?: string; placeId?: string; generalPlaceId?: string }) => void;
}

// 지도를 탭해 지점을 찍는 선택기. 중앙 고정 핀 방식은 지도를 움직일 때마다
// 역지오코딩을 부르는데, 지도는 훑어보려고 움직이는 경우가 대부분이라 헛호출이 많다.
// 탭한 순간에만 핀을 옮기고 그때 한 번 주소를 조회한다.
// 투영 터치 영역은 화면 안의 장소만, 너무 많으면 앞쪽 일부만 만든다(정지 때마다 좌표 변환).
const MAX_HIT_AREAS = 80;

// 장소를 탭하면 메인 지도와 같은 상세 시트를 띄우고, 그 안의 확인 버튼으로 고른다.
type PlaceDetail = { kind: 'registered'; place: Place } | { kind: 'general'; place: TempPlace };

export default function MapPickerModal({ visible, initial, allowPlaces = false, confirmLabel = '이 위치로 선택', onClose, onDismiss, onPick }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const { data: favorites } = useFavoritePlaces(visible && allowPlaces);
  const [mapCenter, setMapCenter] = useState<MapCenter | null>(null);
  const { data: registered } = usePlaces(null, mapCenter, visible && allowPlaces && !!mapCenter);
  const { data: operationalStatuses = {} } = usePlaceOperationalStatuses(visible && allowPlaces);
  // 즐겨찾기는 별 마커로 따로 그리므로 등록 장소 목록에서는 뺀다(메인 지도와 같은 규칙).
  const windowedPlaces = useMemo(() => {
    const favoriteIds = new Set((favorites?.places ?? []).map(place => place.id));
    return (registered ?? []).filter(place => !favoriteIds.has(place.id) && isInMapRenderWindow(place, mapCenter));
  }, [registered, favorites, mapCenter]);
  const generation = useRef(0);
  const mapRef = useRef<NaverMapViewRef>(null);
  const mapReady = useRef(false);
  const projection = useRef(0);
  const [hitAreas, setHitAreas] = useState<{ key: string; name: string; favorite: boolean; open: () => void; x: number; y: number }[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<NavTarget | null>(null);
  const [detail, setDetail] = useState<PlaceDetail | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  // 고른 장소는 원형 마커를 빼고 핀으로 다시 그린다(메인 지도와 같은 규칙).
  const favoriteIds = new Set((favorites?.places ?? []).map(place => place.id));
  const selectedRegistered = detail?.kind === 'registered' ? detail.place : null;
  const selectedClosed = !!selectedRegistered && operationalStatuses[selectedRegistered.id] === 'temporarily_closed';
  const selectedGeneralFavorite = detail?.kind === 'general' ? findGeneralFavorite(favorites?.general ?? [], detail.place) : undefined;
  const dark = colorScheme === 'dark';
  const captionColors = { color: dark ? '#F9FAFB' : '#111827', haloColor: dark ? '#111827' : '#FFFFFF' };

  // 위험 제보처럼 지점만 찍는 화면은 초기 위치(현재 위치 등)에 핀을 놓고 시작한다.
  // 길찾기 지점은 고르지 않은 곳이 경유지로 들어가지 않도록 빈 상태로 연다.
  useEffect(() => {
    if (!visible) { generation.current += 1; projection.current += 1; mapReady.current=false; setHitAreas([]); return; }
    generation.current += 1;
    setSelectedPlace(null);
    setDetail(null);
    setResolving(false);
    const startPin = allowPlaces ? null : initial ?? null;
    setMarker(startPin);
    setMapCenter(initial ? { ...initial, zoom: 16 } : { latitude: DEFAULT_CENTER[1], longitude: DEFAULT_CENTER[0], zoom: DEFAULT_ZOOM });
    setAddress(null);
    if (startPin) void resolveAddress(startPin.latitude, startPin.longitude);
    return () => { generation.current += 1; projection.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => { void projectPlaces(); }, [visible, favorites, allowPlaces, windowedPlaces]);

  async function projectPlaces() {
    const map=mapRef.current, request=++projection.current;
    if (!visible || !allowPlaces || !mapReady.current || !map) { setHitAreas([]); return; }
    const points = [
      ...(favorites?.places ?? []).map(place => ({ key: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, favorite: true, open: () => openRegistered(place) })),
      ...(favorites?.general ?? []).map(place => ({ key: `general-${place.id}`, name: place.name, latitude: place.latitude, longitude: place.longitude, favorite: true, open: () => openGeneral(generalFavoritePlace(place)) })),
      ...windowedPlaces.map(place => ({ key: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, favorite: false, open: () => openRegistered(place) })),
    ].slice(0, MAX_HIT_AREAS);
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
    // 상세 시트가 열려 있으면 빈 지도 탭은 시트만 닫는다(메인 지도와 같은 관례).
    if (detail) { closeDetail(); return; }
    setSelectedPlace(null);
    setMarker({ latitude, longitude });
    setAddress(null);
    void resolveAddress(latitude, longitude);
  };

  const choosePlace = (point: NavTarget, address: string) => {
    generation.current += 1;
    setSelectedPlace(point); setMarker(point); setAddress(address); setResolving(false);
  };

  const openRegistered = (place: Place) => {
    choosePlace({ name: place.name, latitude: place.latitude, longitude: place.longitude, placeId: place.id }, place.address ?? '');
    setDetail({ kind: 'registered', place });
  };

  const openGeneral = (place: TempPlace) => {
    choosePlace({ name: place.name, latitude: place.latitude, longitude: place.longitude, generalPlaceId: place.generalPlaceId }, place.address);
    setDetail({ kind: 'general', place });
  };

  const closeDetail = () => {
    generation.current += 1;
    setDetail(null); setSelectedPlace(null); setMarker(null); setAddress(null); setResolving(false);
  };

  // 네이버 지도 기본 심벌(일반 장소). 패치된 네이티브는 이름 있는 심벌 탭을 소비하므로
  // 이 핸들러가 없으면 일반 장소를 눌러도 아무 일도 일어나지 않는다.
  const handleSymbolTap = ({ latitude, longitude, caption }: { latitude: number; longitude: number; caption: string }) => {
    openGeneral({ name: caption, address: '', latitude, longitude });
    const same = (place: TempPlace) => place.name === caption && place.latitude === latitude;
    const update = (apply: (place: TempPlace) => TempPlace) =>
      setDetail(prev => (prev?.kind === 'general' && same(prev.place) ? { kind: 'general', place: apply(prev.place) } : prev));
    void coordToAddress(latitude, longitude).then(found => { if (found) update(place => ({ ...place, address: found })); }).catch(() => {});
    void resolveSymbolPlace(caption, latitude, longitude).then(apply => { if (apply) update(apply); }).catch(() => {});
  };

  const confirmDetail = () => {
    if (!detail) return;
    const { place } = detail;
    onPick(detail.kind === 'registered'
      ? { latitude: place.latitude, longitude: place.longitude, name: place.name, placeId: detail.place.id, address: place.address ?? null }
      : { latitude: place.latitude, longitude: place.longitude, name: place.name, generalPlaceId: detail.place.generalPlaceId, address: place.address || null });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      {/* 모달 안은 앱 루트의 제스처 영역 밖이라 상세 시트 드래그를 위해 따로 감싼다. */}
      <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background }]}>
        <NaverMapView
          ref={mapRef}
          onInitialized={() => { mapReady.current=true; void projectPlaces(); }}
          onCameraChanged={() => { projection.current += 1; setHitAreas([]); }}
          onCameraIdle={(e) => {
            // 등록 장소 조회 범위는 메인 지도처럼 카메라가 멈췄을 때만 갱신한다.
            setMapCenter({ latitude: e.latitude, longitude: e.longitude, zoom: e.zoom ?? DEFAULT_ZOOM, region: e.region });
            void projectPlaces();
          }}
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
          onTapMap={handleTap}
          onTapSymbol={allowPlaces ? handleSymbolTap : undefined}>
          {allowPlaces && (
            <RegisteredPlaceMarkers places={windowedPlaces}
              selectedPlaceId={detail?.kind === 'registered' ? detail.place.id : null}
              operationalStatuses={operationalStatuses} dark={dark}
              onTap={openRegistered} />
          )}
          {allowPlaces && (
            <FavoritePlaceMarkers
              places={(favorites?.places ?? []).filter(place => isInMapRenderWindow(place, mapCenter))}
              general={(favorites?.general ?? []).filter(place => isInMapRenderWindow(place, mapCenter))}
              selectedPlaceId={selectedRegistered?.id ?? null}
              selectedGeneralId={selectedGeneralFavorite?.id ?? null}
              operationalStatuses={operationalStatuses} dark={dark}
              onTapPlace={openRegistered}
              onTapGeneral={place => openGeneral(generalFavoritePlace(place))} />
          )}
          {/* 고른 장소는 메인 지도처럼 원형 대신 핀으로 바꿔 얹는다. */}
          {selectedRegistered && (
            <NaverMapMarkerOverlay
              latitude={selectedRegistered.latitude}
              longitude={selectedRegistered.longitude}
              image={favoriteIds.has(selectedRegistered.id)
                ? MARKER_IMAGES_FAV[selectedRegistered.category]
                : MARKER_IMAGES[selectedRegistered.category]}
              width={38}
              height={44}
              anchor={{ x: 0.5, y: 1 }}
              alpha={selectedClosed ? TEMPORARILY_CLOSED_MARKER_ALPHA : 1}
              globalZIndex={PLACE_MARKER_GLOBAL_Z_INDEX}
              zIndex={100}
              isForceShowIcon
              isHideCollidedSymbols
              caption={{ text: markerCaption(selectedRegistered.name, selectedClosed), textSize: 12, ...captionColors }} />
          )}
          {detail?.kind === 'general' && (selectedGeneralFavorite ? (
            <NaverMapMarkerOverlay
              latitude={detail.place.latitude}
              longitude={detail.place.longitude}
              image={GENERAL_MARKER_FAV}
              width={38}
              height={44}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={100}
              caption={{ text: detail.place.name, textSize: 13, ...captionColors }} />
          ) : (
            <TempPlaceMarker latitude={detail.place.latitude} longitude={detail.place.longitude} />
          ))}
          {/* 빈 지도를 탭해 찍은 지점. 장소를 고르면 위의 장소 핀이 대신한다. */}
          {marker && !detail && (
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
            <Pressable key={point.key}
              accessibilityRole="button" accessibilityLabel={`${point.name}, ${point.favorite ? '즐겨찾기' : '장소'} 선택`}
              onPress={point.open}
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

        {detail?.kind === 'registered' && (
          <PlaceBottomSheet place={detail.place} onClose={closeDetail} pickAction={{ label: confirmLabel, onPress: confirmDetail }} />
        )}
        {/* 일반 장소 시트는 메인 지도처럼 닫힌 채로 계속 붙여 두고 장소가 들어올 때 연다.
            장소와 함께 마운트하면 첫 snap 명령이 초기 index 적용과 경합해 시트가 안 열릴 때가 있다. */}
        {allowPlaces && (
          <TempPlaceSheet place={detail?.kind === 'general' ? detail.place : null} onClose={closeDetail}
            pickAction={{ label: confirmLabel, onPress: confirmDetail }} />
        )}

        {!detail && <View
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
            accessibilityLabel={confirmLabel}
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
              <Text style={[styles.confirmText, { color: colors.background }]}>{confirmLabel}</Text>
            )}
          </Pressable>
        </View>}
      </GestureHandlerRootView>
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

function generalFavoritePlace({ name, address, latitude, longitude, phone, providerId, placeUrl, generalPlaceId }: GeneralFavorite): TempPlace {
  return { name, address, latitude, longitude, phone, providerId, placeUrl, generalPlaceId };
}

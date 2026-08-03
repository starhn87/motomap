import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryIcon from '@/components/ui/CategoryIcon';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import TempPlaceSheet, { type TempPlace } from '@/components/map/TempPlaceSheet';
import { CATEGORIES } from '@/constants/categories';
import { MARKER_IMAGES, MARKER_IMAGES_CIRCLE } from '@/constants/markerImages';
import { isSamePlace, searchAll } from '@/lib/api/search';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { addRecentSearch } from '@/lib/recentSearches';
import { track } from '@/lib/analytics';
import type { Place } from '@/types';

// 지도에 뿌리는 결과 상한 — 등록 장소가 광범위한 검색어(예: "카페")일 때
// 마커 폭주를 막는다. 목록도 같은 상한을 쓴다.
const MAX_PLACES = 50;

type ResultItem = { kind: 'place'; place: Place } | { kind: 'kakao'; k: KakaoLocalResult };

// 상세 시트가 화면 아래를 덮으므로 카메라 중심을 남쪽으로 내려 고른 장소를
// 시트 위 영역의 가운데에 둔다. 계수는 지도 탭((tabs)/index.tsx)과 같은 값 —
// 이 근사식은 dp/타일 스케일이 섞여 있어 이론값(시트비율/2)이 아니라 실측으로
// 맞춘 0.05 가 화면에서 제대로 앉는다.
function sheetLatOffset(zoom: number, screenHeightDp: number, lat: number): number {
  const latSpan =
    (screenHeightDp / (256 * Math.pow(2, zoom))) * 360 * Math.cos((lat * Math.PI) / 180);
  return latSpan * 0.05;
}

// 검색 결과 지도 화면 — 검색에서 엔터로 진입한다. 등록 장소든 일반 장소든
// 관련 결과를 지도 마커 + 바텀시트 목록으로 한눈에 보여주고, 고르면 기존
// 플로우(등록: 지도 탭 장소 시트 / 일반: 임시 핀)로 넘어간다.
export default function SearchResultsScreen() {
  const { query } = useLocalSearchParams<{ query: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NaverMapViewRef>(null);
  // 결과에서 고른 장소 — 화면을 떠나지 않고 이 지도 위에서 상세 시트를 띄운다.
  // 시트를 닫으면 결과 목록으로 돌아온다(네이버 지도식 복귀).
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedTemp, setSelectedTemp] = useState<TempPlace | null>(null);
  const detailOpen = selectedPlace !== null || selectedTemp !== null;

  // 검색 화면과 같은 쿼리 키 — 방금 친 검색이라 대부분 캐시로 즉시 뜬다
  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchAll(query),
    enabled: !!query,
  });
  const { data: kakaoResults, isLoading: kakaoLoading } = useQuery({
    queryKey: ['search-kakao', query],
    queryFn: () => searchKakaoLocal(query),
    enabled: !!query,
  });

  const items = useMemo<ResultItem[]>(() => {
    const places = (results?.places ?? []).slice(0, MAX_PLACES);
    const kakaoOnly = (kakaoResults ?? []).filter(
      (k) =>
        !places.some((p) =>
          isSamePlace(p, { name: k.placeName, latitude: k.latitude, longitude: k.longitude }),
        ),
    );
    return [
      ...places.map((place) => ({ kind: 'place' as const, place })),
      ...kakaoOnly.map((k) => ({ kind: 'kakao' as const, k })),
    ];
  }, [results, kakaoResults]);

  const loading = isLoading || kakaoLoading;

  // 기본 스냅은 목록 높이에 맞추되 화면의 45% 까지만 — 결과가 두어 개뿐인데
  // 억지로 채우면 지도만 가린다. 행 68 + 핸들·헤더(62) + 어트리뷰션(40).
  const { height: screenH } = useWindowDimensions();
  const midSnap = useMemo(() => {
    const content =
      62 + items.length * 68 + (items.some((r) => r.kind === 'kakao') ? 40 : 0);
    return Math.round(Math.max(180, Math.min(content, screenH * 0.45)));
  }, [items, screenH]);

  // 결과 전체가 보이도록 카메라를 맞춘다 — 남쪽은 바텀시트가 덮는 만큼 더 벌린다
  useEffect(() => {
    if (items.length === 0) return;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const item of items) {
      const lat = item.kind === 'place' ? item.place.latitude : item.k.latitude;
      const lng = item.kind === 'place' ? item.place.longitude : item.k.longitude;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lngSpan = Math.max(maxLng - minLng, 0.01);
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: { latitude: minLat - latSpan * 0.7, longitude: minLng - lngSpan * 0.12 },
      coord2: { latitude: maxLat + latSpan * 0.12, longitude: maxLng + lngSpan * 0.12 },
      duration: 600,
    });
  }, [items]);

  // 고르면 이 화면 안에서 상세 시트를 연다 — 지도 탭과 같은 시트를 재사용한다
  const pick = (item: ResultItem) => {
    const rank = items.indexOf(item);
    if (item.kind === 'place') {
      track.searchResultSelected({ result_type: 'registered', rank, source: 'search_screen' });
      track.placeViewed({
        place_id: item.place.id,
        category: item.place.category,
        source: 'search_results',
      });
      void addRecentSearch({ type: 'place', place: item.place });
      setSelectedPlace(item.place);
      mapRef.current?.animateCameraTo({
        latitude: item.place.latitude - sheetLatOffset(13, screenH, item.place.latitude),
        longitude: item.place.longitude,
        zoom: 13,
        duration: 500,
      });
    } else {
      track.searchResultSelected({ result_type: 'kakao', rank, source: 'search_screen' });
      const { k } = item;
      void addRecentSearch({
        type: 'kakao',
        name: k.placeName,
        address: k.roadAddress || k.address,
        latitude: k.latitude,
        longitude: k.longitude,
        phone: k.phone,
      });
      setSelectedTemp({
        name: k.placeName,
        address: k.roadAddress || k.address,
        latitude: k.latitude,
        longitude: k.longitude,
        phone: k.phone || undefined,
      });
      mapRef.current?.animateCameraTo({
        latitude: k.latitude - sheetLatOffset(13, screenH, k.latitude),
        longitude: k.longitude,
        zoom: 13,
        duration: 500,
      });
    }
  };

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
        locationOverlay={{ isVisible: false }}
        initialCamera={{ latitude: 36.4, longitude: 127.8, zoom: 6 }}>
        {/* 선택된 하나만 핀(물방울, 하단 앵커), 나머지는 원형 — 지도 탭과
            같은 규칙이라 "핀 = 지금 보고 있는 곳"으로 읽힌다. */}
        {items.map((item) => {
          if (item.kind === 'place') {
            const isSelected = selectedPlace?.id === item.place.id;
            return (
              <NaverMapMarkerOverlay
                key={`place-${item.place.id}`}
                latitude={item.place.latitude}
                longitude={item.place.longitude}
                onTap={() => pick(item)}
                anchor={isSelected ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
                width={isSelected ? 38 : 30}
                height={isSelected ? 44 : 30}
                image={
                  isSelected
                    ? MARKER_IMAGES[item.place.category]
                    : MARKER_IMAGES_CIRCLE[item.place.category]
                }
              />
            );
          }
          const isSelected =
            selectedTemp?.latitude === item.k.latitude &&
            selectedTemp?.longitude === item.k.longitude;
          return (
            <TempPlaceMarker
              key={`kakao-${item.k.placeName}-${item.k.latitude}`}
              latitude={item.k.latitude}
              longitude={item.k.longitude}
              circle={!isSelected}
              onTap={() => pick(item)}
            />
          );
        })}
      </NaverMapView>

      {/* 상단 검색어 바 — 상세 시트가 열려 있으면 결과 목록으로, 아니면 검색 화면으로 */}
      <Pressable
        onPress={() => {
          if (detailOpen) {
            setSelectedPlace(null);
            setSelectedTemp(null);
          } else {
            router.back();
          }
        }}
        style={[
          styles.queryBar,
          {
            top: insets.top + 8,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={[styles.queryText, { color: colors.text }]} numberOfLines={1}>
          {query}
        </Text>
        <Ionicons name="search" size={16} color={colors.textSecondary} />
      </Pressable>

      {/* 결과 목록 — 상세 시트가 열려 있는 동안은 내려둔다. 닫으면 복귀.
          최소 스냅(88)은 핸들+결과 개수만 남기고 지도를 넓게 보는 용도. */}
      {!detailOpen && (
      <BottomSheet
        index={1}
        snapPoints={[88, midSnap, '85%']}
        animateOnMount={false}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}>
        <BottomSheetFlatList
          data={items}
          keyExtractor={(item: ResultItem, i: number) =>
            item.kind === 'place' ? `place-${item.place.id}` : `kakao-${item.k.placeName}-${i}`
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              {loading ? '검색 중…' : `검색 결과 ${items.length}개`}
            </Text>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.empty} color={colors.textSecondary} />
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                검색 결과가 없습니다
              </Text>
            )
          }
          ListFooterComponent={
            items.some((r) => r.kind === 'kakao') ? (
              <Text style={[styles.kakaoAttribution, { color: colors.textSecondary }]}>
                장소 정보 제공: 카카오
              </Text>
            ) : null
          }
          renderItem={({ item }: { item: ResultItem }) =>
            item.kind === 'place' ? (
              <Pressable
                onPress={() => pick(item)}
                style={[styles.row, { borderBottomColor: colors.border }]}>
                <CategoryIcon category={item.place.category} size={18} />
                <View style={styles.rowTexts}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {item.place.name}
                  </Text>
                  {!!item.place.address && (
                    <Text
                      style={[styles.rowAddress, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {item.place.address}
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.rowBadge, { color: CATEGORIES[item.place.category].color }]}>
                  {CATEGORIES[item.place.category].label}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => pick(item)}
                style={[styles.row, { borderBottomColor: colors.border }]}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <View style={styles.rowTexts}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {item.k.placeName}
                  </Text>
                  <Text
                    style={[styles.rowAddress, { color: colors.textSecondary }]}
                    numberOfLines={1}>
                    {item.k.roadAddress || item.k.address}
                  </Text>
                </View>
                <Text style={[styles.rowBadge, { color: colors.textSecondary }]}>일반</Text>
              </Pressable>
            )
          }
        />
      </BottomSheet>
      )}

      {/* 지도 탭과 같은 상세 시트 — 닫으면 결과 목록으로 돌아온다 */}
      <PlaceBottomSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} />
      {selectedTemp && (
        <TempPlaceSheet place={selectedTemp} onClose={() => setSelectedTemp(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  queryBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  queryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowAddress: {
    fontSize: 13,
  },
  rowBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
  },
  kakaoAttribution: {
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});

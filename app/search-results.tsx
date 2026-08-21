import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryIcon from '@/components/ui/CategoryIcon';
import EmptyState from '@/components/ui/EmptyState';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import TempPlaceSheet, { type TempPlace } from '@/components/map/TempPlaceSheet';
import { CATEGORIES } from '@/constants/categories';
import { MARKER_IMAGES, MARKER_IMAGES_CIRCLE } from '@/constants/markerImages';
import {
  isSamePlace,
  searchAll,
  SEARCH_RADIUS_M,
} from '@/lib/api/search';
import { useSearchAnchor } from '@/hooks/useSearchAnchor';
import { useBikePlaceMatches } from '@/hooks/useRiderInsights';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { addRecentSearch } from '@/lib/recentSearches';
import { createAnalyticsId, track, type SearchSource } from '@/lib/analytics';
import { describeOpenState, getOpenState } from '@/lib/hours';
import { formatDistance, formatDuration } from '@/constants/course';
import { approxMeters } from '@/lib/distance';
import type { Place, RidingCourse } from '@/types';

// 지도에 뿌리는 결과 상한 — 등록 장소가 광범위한 검색어(예: "카페")일 때
// 마커 폭주를 막는다. 목록도 같은 상한을 쓴다.
const MAX_PLACES = 50;

type ResultItem =
  | { kind: 'place'; place: Place }
  | { kind: 'course'; course: RidingCourse }
  | { kind: 'kakao'; k: KakaoLocalResult };

type SearchFilter = 'open' | 'parking' | 'rating' | 'bike';

const FILTERS: { key: SearchFilter; label: string }[] = [
  { key: 'open', label: '영업 중' },
  { key: 'parking', label: '주차 정보' },
  { key: 'rating', label: '평점 4+' },
  { key: 'bike', label: '내 바이크 추천' },
];

function hasParkingInfo(place: Place): boolean {
  return !!place.parkingInfo?.trim() || place.tags.some((tag) => /주차/.test(tag));
}

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
  const params = useLocalSearchParams<{
    query?: string;
    searchId?: string;
    source?: string;
    browse?: string;
    browseLat?: string;
    browseLng?: string;
  }>();
  const query = typeof params.query === 'string' ? params.query : '';
  const browseLatitude = Number(params.browseLat);
  const browseLongitude = Number(params.browseLng);
  const browseNear =
    params.browse === '1' &&
    Number.isFinite(browseLatitude) &&
    Number.isFinite(browseLongitude) &&
    browseLatitude >= 32 &&
    browseLatitude <= 39 &&
    browseLongitude >= 124 &&
    browseLongitude <= 132
      ? { latitude: browseLatitude, longitude: browseLongitude }
      : undefined;
  const browseMode = !!browseNear;
  const searchQuery = browseMode ? '' : query;
  const [fallbackSearchId] = useState(() => createAnalyticsId('search'));
  const searchId = typeof params.searchId === 'string' ? params.searchId : fallbackSearchId;
  const searchSource: SearchSource = params.source === 'map_bar' ? 'map_bar' : 'search_screen';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NaverMapViewRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const zoomRef = useRef(13);
  // 결과에서 고른 장소 — 화면을 떠나지 않고 이 지도 위에서 상세 시트를 띄운다.
  // 시트를 닫으면 결과 목록으로 돌아온다(네이버 지도식 복귀).
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedTemp, setSelectedTemp] = useState<TempPlace | null>(null);
  const detailOpen = selectedPlace !== null || selectedTemp !== null;
  const [filters, setFilters] = useState<SearchFilter[]>([]);

  // 첫 검색은 검색 화면과 같은 기준점을 쓰되, 결과 지도는 항상 주변 20km로
  // 한정한다. 먼 목적지를 직접 찾는 역할은 앞선 검색 입력 화면이 맡는다.
  const { near: anchorNear } = useSearchAnchor();
  const initialNear = browseNear ?? anchorNear;
  const [searchNear, setSearchNear] = useState(initialNear);
  const [areaSearchRevision, setAreaSearchRevision] = useState(0);
  const [canSearchArea, setCanSearchArea] = useState(false);
  const cameraCenterRef = useRef(initialNear);
  const activeNear = searchNear;
  const nearKey = activeNear
    ? `${activeNear.latitude.toFixed(3)},${activeNear.longitude.toFixed(3)}`
    : 'all';

  useEffect(() => {
    if (!searchNear && initialNear) {
      setSearchNear(initialNear);
      cameraCenterRef.current = initialNear;
    }
  }, [initialNear, searchNear]);

  const requestEnabled = !!activeNear && (browseMode || !!query.trim());
  const resultsQuery = useQuery({
    queryKey: ['search', searchQuery, nearKey, browseMode, areaSearchRevision],
    queryFn: () => searchAll(searchQuery, activeNear, true),
    enabled: requestEnabled,
  });
  const kakaoQuery = useQuery({
    queryKey: ['search-kakao', query, nearKey, areaSearchRevision],
    queryFn: () => searchKakaoLocal(query, activeNear, { throwOnError: true }),
    enabled: requestEnabled && !browseMode,
  });
  const results = resultsQuery.data;
  const kakaoResults = kakaoQuery.data;
  const nearbyKakaoResults = useMemo(
    () =>
      (kakaoResults ?? []).filter(
        (k) =>
          !!activeNear &&
          approxMeters(
            { latitude: k.latitude, longitude: k.longitude },
            activeNear,
          ) <= SEARCH_RADIUS_M &&
          !(results?.places ?? []).some((place) =>
            isSamePlace(place, {
              name: k.placeName,
              latitude: k.latitude,
              longitude: k.longitude,
            }),
          ),
      ),
    [kakaoResults, results?.places, activeNear],
  );
  const bikeMatches = useBikePlaceMatches(
    (results?.places ?? []).map((place) => place.id),
  );

  const items = useMemo<ResultItem[]>(() => {
    const places = (results?.places ?? []).filter((place) => {
      if (filters.includes('open') && getOpenState(place.hours).status !== 'open') return false;
      if (filters.includes('parking') && !hasParkingInfo(place)) return false;
      if (filters.includes('rating') && (place.rating < 4 || place.reviewCount === 0)) return false;
      if (filters.includes('bike') && !bikeMatches.data?.[place.id]) return false;
      return true;
    }).slice(0, MAX_PLACES);
    // 코스·카카오 결과에는 영업시간/주차/평점의 같은 필드가 없다. 필터를 켰을 때
    // 섞어 보여주면 필터가 고장 난 것처럼 보이므로 등록 장소만 남긴다.
    const courses = filters.length === 0 ? (results?.courses ?? []) : [];
    const kakaoOnly = filters.length === 0 ? nearbyKakaoResults : [];
    return [
      ...places.map((place) => ({ kind: 'place' as const, place })),
      ...kakaoOnly.map((k) => ({ kind: 'kakao' as const, k })),
      ...courses.map((course) => ({ kind: 'course' as const, course })),
    ];
  }, [results, nearbyKakaoResults, filters, bikeMatches.data]);

  const sourcesReady =
    requestEnabled && resultsQuery.isSuccess && (browseMode || kakaoQuery.isSuccess);
  const rawResultCount =
    (results?.places.length ?? 0) +
    (results?.courses.length ?? 0) +
    nearbyKakaoResults.length;
  const showEmpty = sourcesReady && rawResultCount === 0;
  const searchFailed =
    resultsQuery.isError || (!browseMode && kakaoQuery.isError);

  // 필터를 켜지 않았어도 각 행에 바이크 근거가 표시된다. 이 데이터만 늦게
  // 들어오면 메타 행이 한 줄 더 생기므로 최초 결과는 함께 준비한다.
  const hasRegisteredResults = (results?.places.length ?? 0) > 0;
  const loading =
    !requestEnabled ||
    resultsQuery.isLoading ||
    (!browseMode && kakaoQuery.isLoading) ||
    (hasRegisteredResults && (bikeMatches.isLoading || bikeMatches.bikesLoading));

  // 검색 화면을 건너온 음성 검색과 범위 재검색도 같은 search_id 로 묶는다.
  // 결과 종류가 모두 준비된 뒤 한 번만 기록해 부분 로딩 수치가 섞이지 않게 한다.
  const viewedResultSets = useRef(new Set<string>());
  useEffect(() => {
    if (!query || loading || searchFailed || !sourcesReady) return;
    const resultSet = `near:${nearKey}:${areaSearchRevision}`;
    if (viewedResultSets.current.has(resultSet)) return;
    viewedResultSets.current.add(resultSet);
    const registeredCount = results?.places.length ?? 0;
    const kakaoCount = nearbyKakaoResults.length;
    const courseCount = results?.courses.length ?? 0;
    track.searchResultsViewed({
      search_id: searchId,
      source: searchSource,
      query: browseMode ? undefined : query,
      registered_count: registeredCount,
      kakao_count: kakaoCount,
      course_count: courseCount,
      scope: 'near',
    });
    if (registeredCount === 0 && !browseMode) {
      track.searchNoResults({
        search_id: searchId,
        source: searchSource,
        query,
        kakao_count: kakaoCount,
      });
    }
  }, [
    query,
    browseMode,
    loading,
    searchFailed,
    sourcesReady,
    results,
    nearbyKakaoResults,
    activeNear,
    nearKey,
    areaSearchRevision,
    searchId,
    searchSource,
  ]);

  // 기본 스냅은 목록 높이에 맞추되 화면의 45% 까지만 — 결과가 두어 개뿐인데
  // 억지로 채우면 지도만 가린다. 이름·주소·메타를 포함한 행 80px로 잡는다.
  const { height: screenH } = useWindowDimensions();
  const midSnap = useMemo(() => {
    const content = 62 + items.length * 80;
    return Math.round(Math.max(180, Math.min(content, screenH * 0.45)));
  }, [items, screenH]);

  // 결과 전체가 보이도록 카메라를 맞춘다. 하나뿐이면 가상의 좌표 범위를 만들지
  // 않고, 바텀시트를 제외한 지도 영역의 정확한 중앙을 카메라 pivot으로 쓴다.
  useEffect(() => {
    if (!mapReady || loading || showEmpty || searchFailed || detailOpen) return;
    const mapped = items.filter(
      (item): item is Exclude<ResultItem, { kind: 'course' }> => item.kind !== 'course',
    );
    if (mapped.length === 0) return;
    if (mapped.length === 1) {
      const item = mapped[0];
      const latitude = item.kind === 'place' ? item.place.latitude : item.k.latitude;
      const longitude = item.kind === 'place' ? item.place.longitude : item.k.longitude;
      const visibleCenterY = (screenH - midSnap) / (screenH * 2);
      mapRef.current?.animateCameraTo({
        latitude,
        longitude,
        zoom: 14,
        pivot: { x: 0.5, y: Math.max(0.1, Math.min(0.5, visibleCenterY)) },
        duration: 600,
      });
      return;
    }
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const item of mapped) {
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
  }, [
    items,
    mapReady,
    loading,
    showEmpty,
    searchFailed,
    detailOpen,
    screenH,
    midSnap,
  ]);

  // 빈 결과·오류 화면에서는 네이티브 지도를 언마운트한다. 같은 라우트에서 다시
  // 결과가 생기면 새 지도 초기화가 끝난 뒤에만 카메라를 맞추도록 readiness도 버린다.
  useEffect(() => {
    if (showEmpty || searchFailed) setMapReady(false);
  }, [showEmpty, searchFailed]);

  // 고르면 이 화면 안에서 상세 시트를 연다 — 지도 탭과 같은 시트를 재사용한다
  // 지도에서 마커를 눌렀을 때는 줌을 건드리지 않는다. 이미 그 지도를 보고 있는
  // 사람에게 축척이 튀는 건 위치를 다시 파악하게 만든다 — 목록에서 고를 때만
  // 결과가 잘 보이는 축척으로 맞춘다.
  const pick = (item: ResultItem, keepZoom = false) => {
    const zoom = keepZoom ? zoomRef.current : 13;
    const rank = items.indexOf(item);
    if (item.kind === 'course') {
      track.searchResultSelected({
        search_id: searchId,
        result_type: 'course',
        rank,
        source: searchSource,
      });
      void addRecentSearch({ type: 'course', id: item.course.id, name: item.course.name });
      router.push(`/course/${item.course.id}`);
      return;
    }
    if (item.kind === 'place') {
      track.searchResultSelected({
        search_id: searchId,
        result_type: 'registered',
        rank,
        source: searchSource,
      });
      track.placeViewed({
        place_id: item.place.id,
        category: item.place.category,
        source: 'search_results',
      });
      void addRecentSearch({ type: 'place', place: item.place });
      // 두 시트는 겹쳐 있다 — 하나를 열 때 다른 하나를 반드시 닫는다.
      // 안 그러면 위 시트를 내렸을 때 아까 보던 카드가 뒤에서 드러난다.
      setSelectedTemp(null);
      setSelectedPlace(item.place);
      mapRef.current?.animateCameraTo({
        latitude: item.place.latitude - sheetLatOffset(zoom, screenH, item.place.latitude),
        longitude: item.place.longitude,
        zoom,
        duration: 500,
      });
    } else {
      track.searchResultSelected({
        search_id: searchId,
        result_type: 'kakao',
        rank,
        source: searchSource,
      });
      const { k } = item;
      void addRecentSearch({
        type: 'kakao',
        name: k.placeName,
        address: k.roadAddress || k.address,
        latitude: k.latitude,
        longitude: k.longitude,
        phone: k.phone,
        providerId: k.providerId,
        placeUrl: k.placeUrl,
      });
      setSelectedPlace(null);
      setSelectedTemp({
        name: k.placeName,
        address: k.roadAddress || k.address,
        latitude: k.latitude,
        longitude: k.longitude,
        phone: k.phone || undefined,
        providerId: k.providerId,
        placeUrl: k.placeUrl,
      });
      mapRef.current?.animateCameraTo({
        latitude: k.latitude - sheetLatOffset(zoom, screenH, k.latitude),
        longitude: k.longitude,
        zoom,
        duration: 500,
      });
    }
  };

  const resultLabel = browseMode ? `${query} 주변` : query;
  const statusHeader = (
    <View
      style={[
        styles.statusHeader,
        {
          paddingTop: insets.top + 8,
          borderBottomColor: colors.border,
        },
      ]}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.statusBackButton}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={[styles.statusQuery, { color: colors.text }]} numberOfLines={1}>
        {resultLabel}
      </Text>
      <View style={styles.statusTrailing}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
      </View>
    </View>
  );

  if (searchFailed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {statusHeader}
        <EmptyState
          icon={<Ionicons name="cloud-offline-outline" size={44} color={colors.textSecondary} />}
          title="검색 결과를 불러오지 못했어요"
          hint="연결 상태를 확인하고 다시 시도해 주세요."
          actionLabel="다시 시도"
          onAction={() => {
            void resultsQuery.refetch();
            if (!browseMode) void kakaoQuery.refetch();
          }}
        />
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {statusHeader}
        <EmptyState
          icon={<Ionicons name="location-outline" size={44} color={colors.textSecondary} />}
          title="이 지역에 검색 결과가 없어요"
          hint={`“${query}”에 해당하는 장소를 찾지 못했어요.\n알고 있는 장소가 있다면 라이더들에게 알려주세요.`}
          actionLabel="새로운 장소 제보"
          onAction={() => {
            track.placeSubmissionOpened({ source: 'search_empty' });
            router.navigate({
              pathname: '/submit',
              params: {
                submitType: 'place',
                submitTs: String(Date.now()),
                prefillSource: 'search_empty',
              },
            });
          }}
        />
      </View>
    );
  }

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
        initialCamera={{ latitude: 36.4, longitude: 127.8, zoom: 6 }}
        onInitialized={() => setMapReady(true)}
        onCameraChanged={(e) => {
          if (typeof e.zoom === 'number') zoomRef.current = e.zoom;
          cameraCenterRef.current = { latitude: e.latitude, longitude: e.longitude };
          if (e.reason === 'Gesture') setCanSearchArea(true);
        }}>
        {/* 선택된 하나만 핀(물방울, 하단 앵커), 나머지는 원형 — 지도 탭과
            같은 규칙이라 "핀 = 지금 보고 있는 곳"으로 읽힌다. */}
        {items.map((item) => {
          if (item.kind === 'course') return null;
          if (item.kind === 'place') {
            const isSelected = selectedPlace?.id === item.place.id;
            return (
              <NaverMapMarkerOverlay
                key={`place-${item.place.id}`}
                latitude={item.place.latitude}
                longitude={item.place.longitude}
                onTap={() => pick(item, true)}
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
              onTap={() => pick(item, true)}
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
          {browseMode ? `${query} 주변` : query}
        </Text>
        <Ionicons name="search" size={16} color={colors.textSecondary} />
      </Pressable>

      {canSearchArea && cameraCenterRef.current && !detailOpen && (
        <Pressable
          onPress={() => {
            setSearchNear(cameraCenterRef.current);
            setAreaSearchRevision((revision) => revision + 1);
            setCanSearchArea(false);
            track.searchAreaRefreshed({ search_id: searchId });
          }}
          style={({ pressed }) => [
            styles.searchAreaButton,
            {
              top: insets.top + 62,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
            pressed && { opacity: 0.75 },
          ]}>
          <Ionicons name="refresh" size={15} color={colors.text} />
          <Text style={[styles.searchAreaText, { color: colors.text }]}>이 지역에서 다시 검색</Text>
        </Pressable>
      )}

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
            item.kind === 'place'
              ? `place-${item.place.id}`
              : item.kind === 'course'
                ? `course-${item.course.id}`
                : `kakao-${item.k.placeName}-${i}`
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            <View>
              <Text style={[styles.countText, { color: colors.textSecondary }]}>
                {loading ? '검색 중…' : `${browseMode ? '주변 결과' : '검색 결과'} ${items.length}개`}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}>
                {FILTERS.filter(
                  (filter) => filter.key !== 'bike' || !!bikeMatches.activeBike,
                ).map((filter) => {
                  const selected = filters.includes(filter.key);
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => {
                        track.searchFilterToggled({
                          search_id: searchId,
                          filter: filter.key,
                          on: !selected,
                        });
                        setFilters((current) =>
                          current.includes(filter.key)
                            ? current.filter((key) => key !== filter.key)
                            : [...current, filter.key],
                        );
                      }}
                      style={[
                        styles.filterChip,
                        { borderColor: selected ? colors.tint : colors.border },
                        selected && { backgroundColor: colors.tint },
                      ]}>
                      {selected && <Ionicons name="checkmark" size={14} color={colors.background} />}
                      <Text style={[styles.filterText, { color: selected ? colors.background : colors.text }]}>
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.empty} color={colors.textSecondary} />
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {filters.includes('bike')
                  ? '같은 기종·유형 라이더의 추천 기록이 아직 없습니다'
                  : filters.length > 0
                    ? '선택한 조건에 맞는 장소가 없습니다'
                    : '검색 결과가 없습니다'}
              </Text>
            )
          }
          renderItem={({ item }: { item: ResultItem }) =>
            item.kind === 'place' ? (
              (() => {
                const open = describeOpenState(getOpenState(item.place.hours));
                return (
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
                      <View style={styles.rowMeta}>
                        {open && (
                          <Text style={[styles.rowMetaText, { color: open.open ? semantic.success : colors.textSecondary }]}>
                            {open.text}
                          </Text>
                        )}
                        {item.place.reviewCount > 0 && (
                          <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>
                            ★ {item.place.rating.toFixed(1)} ({item.place.reviewCount})
                          </Text>
                        )}
                        {hasParkingInfo(item.place) && (
                          <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>주차 정보</Text>
                        )}
                        {bikeMatches.data?.[item.place.id] && (
                          <Text style={[styles.rowMetaText, { color: colors.tint }]}>
                            {bikeMatches.data[item.place.id].kind === 'same_model'
                              ? `같은 기종 ${bikeMatches.data[item.place.id].exactRiders}명`
                              : `같은 유형 ${bikeMatches.data[item.place.id].supporters}명`}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text
                      style={[styles.rowBadge, { color: CATEGORIES[item.place.category].color }]}>
                      {CATEGORIES[item.place.category].label}
                    </Text>
                  </Pressable>
                );
              })()
            ) : item.kind === 'course' ? (
              <Pressable
                onPress={() => pick(item)}
                style={[styles.row, { borderBottomColor: colors.border }]}>
                <MaterialCommunityIcons name="road-variant" size={19} color={colors.tint} />
                <View style={styles.rowTexts}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {item.course.name}
                  </Text>
                  <Text style={[styles.rowAddress, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[item.course.routeName, item.course.description].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>
                    {formatDistance(item.course.distance)} · {formatDuration(item.course.duration)}
                    {item.course.reviewCount > 0
                      ? ` · ★ ${item.course.rating.toFixed(1)} (${item.course.reviewCount})`
                      : ''}
                  </Text>
                </View>
                <Text style={[styles.rowBadge, { color: colors.tint }]}>코스</Text>
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
                    카카오 장소 검색 · {item.k.roadAddress || item.k.address}
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
      <TempPlaceSheet place={selectedTemp} onClose={() => setSelectedTemp(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusBackButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusQuery: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  statusTrailing: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    zIndex: 3,
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
  searchAreaButton: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 2,
  },
  searchAreaText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterRow: {
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  filterChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 17,
  },
  filterText: {
    fontSize: 12.5,
    fontWeight: '700',
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
  rowMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    minHeight: 14,
  },
  rowMetaText: {
    fontSize: 11.5,
    fontWeight: '600',
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
});

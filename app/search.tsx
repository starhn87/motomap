import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import CategoryIcon from '@/components/ui/CategoryIcon';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Keyboard,
  InteractionManager,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import {
  explainCourseMatch,
  explainPlaceMatch,
  isSamePlace,
  searchAll,
} from '@/lib/api/search';
import { useSearchAnchor } from '@/hooks/useSearchAnchor';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { fetchFavoritePlaces } from '@/lib/api/favorites';
import { useRecommendedPlaces } from '@/hooks/usePlaces';
import { useAuthStore } from '@/stores/useAuthStore';
import { searchKakaoLocal, coordToRegion, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { openNavigation } from '@/lib/navigation';
import { toast } from '@/lib/toast';
import { formatDistance } from '@/constants/course';
import { haversine } from '@/lib/distance';
import { focusPlaceOnMap } from '@/lib/mapFocus';
import { useMapStore } from '@/stores/useMapStore';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { createAnalyticsId, track } from '@/lib/analytics';
import Skeleton from '@/components/ui/Skeleton';
import {
  loadRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  saveRecentSearches,
  recentKey,
  type RecentSearch,
} from '@/lib/recentSearches';
import type { Place } from '@/types';

// 검색 전용 화면 — 입력 전에는 최근 검색·즐겨찾기·추천 목적지를 모아 보여주고,
// 2자 이상 입력하면 통합 검색 결과로 전환된다. 장소 선택은 지도 탭의
// focusPlaceId 파라미터(승인 푸시 딥링크와 같은 경로)로 전달한다.

// 최근 검색의 일반 장소가 그 사이 제보로 등록됐으면 등록 장소 항목으로 승격한다
async function promoteRegisteredKakao(list: RecentSearch[]): Promise<RecentSearch[] | null> {
  if (!list.some((e) => e.type === 'kakao')) return null;
  try {
    // query '' 는 전체 장소를 반환한다 (all_places + 클라 필터 구조)
    const { places } = await searchAll('');
    let changed = false;
    const next: RecentSearch[] = list.map((e) => {
      if (e.type !== 'kakao') return e;
      const match = places.find((p) =>
        isSamePlace(p, { name: e.name, latitude: e.latitude, longitude: e.longitude }),
      );
      if (!match) return e;
      changed = true;
      return { type: 'place', place: match };
    });
    if (!changed) return null;
    // 승격으로 기존 place 항목과 겹치면 앞선 것만 남긴다
    const seen = new Set<string>();
    const deduped = next.filter((e) => {
      const k = recentKey(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await saveRecentSearches(deduped);
    return deduped;
  } catch {
    return null;
  }
}

function SearchLandingSkeleton() {
  return (
    <View style={styles.landingSkeleton}>
      <View style={styles.landingPlaceRow}>
        <Skeleton width="48%" height={58} radius={12} />
        <Skeleton width="48%" height={58} radius={12} />
      </View>
      <Skeleton width="100%" height={70} radius={14} />
      <Skeleton width={90} height={16} style={{ marginTop: 18 }} />
      {Array.from({ length: 5 }).map((_, index) => (
        <View key={index} style={styles.landingRowSkeleton}>
          <Skeleton width={24} height={24} radius={12} />
          <View style={styles.landingRowBody}>
            <Skeleton width="55%" height={15} />
            <Skeleton width="78%" height={12} style={{ marginTop: 5 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const [query, setQuery] = useState('');
  const userLocation = useMapStore((s) => s.userLocation);
  const inputRef = useRef<TextInput>(null);

  // autoFocus 대신 화면 전환이 끝난 뒤 포커스 — 지도가 배경에 살아있는 채로
  // push 애니메이션과 키보드 상승이 겹치면 구형 기기에서 메인 스레드가 멈춘다
  // (Sentry AppHang, RCTTextInputComponentView didMoveToWindow).
  // 첫 진입만이 아니라 재진입(결과 지도의 검색어 바로 돌아온 경우)에도 —
  // 이 화면은 입력하러 오는 화면이라 바로 수정 모드가 되는 게 맞다.
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => inputRef.current?.focus());
      return () => task.cancel();
    }, []),
  );
  // 엔터·음성 인식이 공유하는 진입점 — 등록 장소든 아니든 결과를 지도로 본다
  const openResults = useCallback((text: string, method: 'typed' | 'voice' = 'typed') => {
    const q = text.trim();
    if (q.length < 2) return;
    const searchId = createAnalyticsId('search');
    track.searchSubmitted({ search_id: searchId, method, source: 'search_screen', query: q });
    Keyboard.dismiss();
    router.push({
      pathname: '/search-results' as any,
      params: { query: q, searchId, source: 'search_screen' },
    });
  }, []);

  // 음성 검색 — 인식된 말이 그대로 입력창에 들어가고, 끝나면 결과 지도로 넘어간다
  const { listening, toggle: toggleVoice } = useVoiceSearch((text, isFinal) => {
    setQuery(text);
    if (isFinal) openResults(text, 'voice');
  });

  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadRecentSearches().then(async (list) => {
      if (cancelled) return;
      setRecent(list);
      setRecentLoading(false);
      const promoted = await promoteRegisteredKakao(list);
      if (!cancelled && promoted) setRecent(promoted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 내 장소(집·회사) — 기기 로컬 저장. 탭하면 바로 길안내, 미저장이면 설정
  const myPlaces = useMyPlacesStore((s) => s.places);
  const myPlacesLoaded = useMyPlacesStore((s) => s.loaded);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  // 저장 안 된 슬롯을 탭하면 주소 검색으로 바로 설정한다. 변경·삭제는
  // 설정 화면의 '내 장소'에서 — 롱프레스 같은 숨은 동작은 두지 않는다.
  const [editingSlot, setEditingSlot] = useState<MyPlaceSlot | null>(null);

  const handleMyPlace = (slot: MyPlaceSlot) => {
    const saved = myPlaces[slot];
    if (!saved) {
      Keyboard.dismiss();
      setEditingSlot(slot);
      return;
    }
    Keyboard.dismiss();
    void openNavigation({
      name: saved.name,
      latitude: saved.latitude,
      longitude: saved.longitude,
    });
  };

  const handleSlotSelect = (point: Point, address?: string) => {
    const slot = editingSlot;
    setEditingSlot(null);
    if (!slot || point === 'current') return;
    void saveMyPlace(slot, {
      name: point.name,
      address: address ?? '',
      latitude: point.latitude,
      longitude: point.longitude,
    });
    toast.success(slot === 'home' ? '집을 저장했어요.' : '회사를 저장했어요.');
  };

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  const inlineSearchId = useMemo(
    () => (searching ? createAnalyticsId('search') : null),
    [searching, trimmed],
  );

  // 지금 보는 지도 주변을 우선 — 같은 "강릉 카페"라도 보고 있는 지역 것이 먼저
  const { near, key: nearKey } = useSearchAnchor();
  const { data: results, isLoading } = useQuery({
    queryKey: ['search', trimmed, nearKey],
    queryFn: () => searchAll(trimmed, near),
    enabled: searching,
  });

  // 정렬 기준을 화면에 말해 준다 — "무슨 순서지?"가 안 생기게 지역명으로 안내
  const { data: anchorRegion } = useQuery({
    queryKey: ['search-anchor-region', nearKey],
    queryFn: () => coordToRegion(near!.latitude, near!.longitude),
    enabled: !!near && searching,
    staleTime: 30 * 60 * 1000,
  });

  // "일반 장소" — DB(라이더 특화 장소)에 없는 곳도 카카오 로컬로 찾아 목적지로 쓸 수 있게
  const { data: kakaoResults } = useQuery({
    queryKey: ['search-kakao', trimmed, nearKey],
    queryFn: () => searchKakaoLocal(trimmed, near),
    enabled: searching,
  });

  // 이미 등록된 장소는 일반 장소 섹션에서 뺀다
  const kakaoOnly = (kakaoResults ?? []).filter(
    (k) =>
      !(results?.places ?? []).some((p) =>
        isSamePlace(p, { name: k.placeName, latitude: k.latitude, longitude: k.longitude }),
      ),
  );

  const { data: favorites, isLoading: favoritesLoading } = useQuery({
    queryKey: ['favorites', 'places', user?.id],
    queryFn: fetchFavoritePlaces,
    enabled: !!user,
  });

  const { data: recommended, isLoading: recommendedLoading } = useRecommendedPlaces();
  const landingLoading =
    !myPlacesLoaded ||
    recentLoading ||
    recommendedLoading ||
    (!!user && favoritesLoading);

  // 등록 장소가 0건이면 한 번 남긴다 — 카카오까지 0건일 때만 세면 거의 안 찍힌다
  // (카카오는 웬만한 문자열에 뭐라도 돌려준다). 정작 알고 싶은 건 우리 DB 가
  // 못 찾은 경우다. 함께 싣는 kakao_count 로 오타와 "제보할 곳"을 가른다.
  const reportedResults = useRef(new Set<string>());
  useEffect(() => {
    if (!searching || !inlineSearchId || isLoading || kakaoResults === undefined) return;
    const registered = results?.places.length ?? 0;
    const courses = results?.courses.length ?? 0;
    if (reportedResults.current.has(inlineSearchId)) return;
    // 타이핑 중간 문자열을 결과 조회·미검색어로 세지 않도록 잠시 안정된 뒤 기록한다.
    const timer = setTimeout(() => {
      if (reportedResults.current.has(inlineSearchId)) return;
      reportedResults.current.add(inlineSearchId);
      track.searchResultsViewed({
        search_id: inlineSearchId,
        source: 'search_screen',
        query: trimmed,
        registered_count: registered,
        kakao_count: kakaoOnly.length,
        course_count: courses,
        scope: near ? 'near' : 'all',
      });
      if (registered === 0) {
        track.searchNoResults({
          search_id: inlineSearchId,
          source: 'search_screen',
          query: trimmed,
          kakao_count: kakaoOnly.length,
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [
    searching,
    inlineSearchId,
    isLoading,
    kakaoResults,
    results?.places.length,
    results?.courses.length,
    kakaoOnly.length,
    trimmed,
    near,
  ]);

  const goToPlace = useCallback((place: Place, rank?: number) => {
    Keyboard.dismiss();
    if (rank !== undefined && inlineSearchId) {
      track.searchResultSelected({
        search_id: inlineSearchId,
        result_type: 'registered',
        rank,
        source: 'search_screen',
      });
    }
    addRecentSearch({ type: 'place', place });
    // 지도 탭으로 돌아가 마지막 보던 화면에서 장소로 날아간다(딥링크가 복귀 후
    // 실행돼 이동이 눈에 보인다 — 감추지 않는 게 의도)
    focusPlaceOnMap(place.id, { source: 'search', place });
  }, [inlineSearchId]);

  const goToKakaoPlace = useCallback(
    (
      name: string,
      address: string,
      latitude: number,
      longitude: number,
      phone?: string,
      rank?: number,
    ) => {
      Keyboard.dismiss();
      if (rank !== undefined && inlineSearchId) {
        track.searchResultSelected({
          search_id: inlineSearchId,
          result_type: 'kakao',
          rank,
          source: 'search_screen',
        });
      }
      addRecentSearch({ type: 'kakao', name, address, latitude, longitude, phone });
      router.navigate({
        pathname: '/',
        params: {
          kakaoName: name,
          kakaoAddress: address,
          kakaoLat: String(latitude),
          kakaoLng: String(longitude),
          kakaoPhone: phone ?? '',
          focusTs: String(Date.now()),
        },
      });
    },
    [inlineSearchId],
  );

  const goToCourse = useCallback((courseId: string, courseName: string, rank?: number) => {
    Keyboard.dismiss();
    if (rank !== undefined && inlineSearchId) {
      track.searchResultSelected({
        search_id: inlineSearchId,
        result_type: 'course',
        rank,
        source: 'search_screen',
      });
    }
    addRecentSearch({ type: 'course', id: courseId, name: courseName });
    router.push(`/course/${courseId}`);
  }, [inlineSearchId]);

  const browseArea = () => {
    const anchor = kakaoOnly[0];
    if (!anchor || !inlineSearchId) return;
    Keyboard.dismiss();
    track.searchAreaBrowsed({ search_id: inlineSearchId, source: 'search_screen' });
    router.push({
      pathname: '/search-results' as any,
      params: {
        query: trimmed,
        searchId: inlineSearchId,
        source: 'search_screen',
        browse: '1',
        browseLat: String(anchor.latitude),
        browseLng: String(anchor.longitude),
      },
    });
  };

  const placeRow = (place: Place, keyPrefix: string, rank?: number) => {
    const cat = CATEGORIES[place.category];
    return (
      <Pressable
        key={`${keyPrefix}-${place.id}`}
        onPress={() => goToPlace(place, rank)}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <View style={styles.rowIconWrap}><CategoryIcon category={place.category} size={20} /></View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {place.name}
          </Text>
          {rank !== undefined && (
            <Text style={[styles.rowReason, { color: colors.tint }]} numberOfLines={1}>
              {explainPlaceMatch(trimmed, place)}
            </Text>
          )}
          <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {near
              ? // 정렬 기준(지도 중심)과 같은 기준으로 — 내 위치 거리를 쓰면
                // 목록이 뒤죽박죽으로 보인다(정렬은 지도, 숫자는 내 위치였던 버그)
                `${formatDistance(haversine(near, place) / 1000)} · ${place.address}`
              : place.address}
          </Text>
        </View>
        <Text style={[styles.rowBadge, { color: cat.color }]}>{cat.label}</Text>
      </Pressable>
    );
  };

  const sectionTitle = (title: string, right?: React.ReactNode) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {right}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* 검색 입력 바 */}
      <View style={styles.searchBarRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.tint },
          ]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            placeholder={listening ? '듣고 있어요…' : '장소, 코스 검색'}
            placeholderTextColor={listening ? colors.tint : colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => openResults(query)}
          />
          {/* 인식 중에는 숨긴다 — 다음 중간 결과가 어차피 덮어써서 지운 게 무의미하다 */}
          {query.length > 0 && !listening && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.inputAction}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
          <Pressable onPress={toggleVoice} hitSlop={8} style={styles.inputAction}>
            <Ionicons
              name={listening ? 'mic' : 'mic-outline'}
              size={20}
              color={listening ? colors.tint : colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      {searching ? (
        // 검색 결과
        isLoading ? (
          <ActivityIndicator size="small" color={colors.tint} style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            ListHeaderComponent={
              <>
                {near &&
                  ((results?.places.length ?? 0) > 0 ||
                    (results?.courses.length ?? 0) > 0 ||
                    kakaoOnly.length > 0) && (
                    <Text style={[styles.anchorNotice, { color: colors.textSecondary }]}>
                      📍 {anchorRegion ?? '지금 보는 지도'} 주변 결과부터 보여드려요
                    </Text>
                  )}
                {(results?.places.length ?? 0) === 0 && kakaoOnly.length > 0 && (
                  <Pressable
                    onPress={browseArea}
                    style={[styles.browseAreaCard, { backgroundColor: colors.surface, borderColor: colors.tint }]}>
                    <Ionicons name="map-outline" size={20} color={colors.tint} />
                    <View style={styles.rowInfo}>
                      <Text style={[styles.browseAreaTitle, { color: colors.text }]}>이 지역 둘러보기</Text>
                      <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {trimmed} 주변의 라이더 장소와 코스를 모아볼게요
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.tint} />
                  </Pressable>
                )}
              </>
            }
            data={[
              // 정렬은 searchAll 이 지도 중심(없으면 내 위치) 기준으로 이미 했다 —
              // 여기서 내 위치로 다시 정렬하면 "보고 있는 지역" 우선이 무효가 된다
              ...((results?.places ?? []).map((p) => ({ type: 'place' as const, data: p }))),
              ...(results?.courses.map((c) => ({ type: 'course' as const, data: c })) ?? []),
              ...(kakaoOnly.length
                ? [
                    { type: 'kakao-header' as const, data: null },
                    ...kakaoOnly.map((k) => ({ type: 'kakao' as const, data: k })),
                    { type: 'kakao-footer' as const, data: null },
                  ]
                : []),
            ]}
            keyExtractor={(item, index) =>
              item.type === 'kakao'
                ? `kakao-${(item.data as KakaoLocalResult).placeName}-${index}`
                : item.type === 'kakao-header' || item.type === 'kakao-footer'
                  ? item.type
                  : `${item.type}-${(item.data as { id: string }).id}`
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={[styles.noResult, { color: colors.textSecondary }]}>
                검색 결과가 없습니다
              </Text>
            }
            renderItem={({ item, index }) =>
              item.type === 'kakao-header' ? (
                sectionTitle('일반 장소')
              ) : item.type === 'kakao-footer' ? (
                <Text style={[styles.kakaoAttribution, { color: colors.textSecondary }]}>
                  장소 정보 제공: 카카오
                </Text>
              ) : item.type === 'kakao' ? (
                (() => {
                  const k = item.data as KakaoLocalResult;
                  return (
                    <Pressable
                      onPress={() =>
                        goToKakaoPlace(
                          k.placeName,
                          k.roadAddress || k.address,
                          k.latitude,
                          k.longitude,
                          k.phone,
                          index - 1,
                        )
                      }
                      style={({ pressed }) => [
                        styles.row,
                        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <View style={styles.rowIconWrap}><Ionicons name="location-outline" size={20} color="#475569" /></View>
                      <View style={styles.rowInfo}>
                        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                          {k.placeName}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                          카카오 장소 검색 · {k.roadAddress || k.address}
                        </Text>
                      </View>
                      <Text style={[styles.rowBadge, { color: colors.textSecondary }]}>일반</Text>
                    </Pressable>
                  );
                })()
              ) : item.type === 'place' ? (
                placeRow(item.data as Place, 'result', index)
              ) : (
                <Pressable
                  onPress={() => goToCourse(item.data.id, item.data.name, index)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={styles.rowIconWrap}><MaterialCommunityIcons name="road-variant" size={20} color={colors.tint} /></View>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {item.data.name}
                    </Text>
                    <Text style={[styles.rowReason, { color: colors.tint }]} numberOfLines={1}>
                      {explainCourseMatch(trimmed, item.data)}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.data.description}
                    </Text>
                  </View>
                  {item.data.distance > 0 && (
                    <Text style={[styles.rowBadge, { color: colors.textSecondary }]}>
                      {formatDistance(item.data.distance)}
                    </Text>
                  )}
                </Pressable>
              )
            }
          />
        )
      ) : landingLoading ? (
        <SearchLandingSkeleton />
      ) : (
        // 입력 전 — AI 추천 · 최근 검색 · 즐겨찾기 · 추천 목적지
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}>
          {/* 내 장소 — 집·회사 원터치 길안내 */}
          <View style={styles.myPlacesRow}>
            {(['home', 'work'] as const).map((slot) => {
              const saved = myPlaces[slot];
              return (
                <Pressable
                  key={slot}
                  onPress={() => handleMyPlace(slot)}
                  style={({ pressed }) => [
                    styles.myPlaceCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Ionicons name={slot === 'home' ? 'home' : 'business'} size={20} color={colors.tint} />
                  <View style={styles.rowInfo}>
                    <Text style={[styles.myPlaceLabel, { color: colors.text }]}>
                      {slot === 'home' ? '집' : '회사'}
                    </Text>
                    {/* 장소명은 민감 정보라 표시하지 않는다 — 미저장 안내만 */}
                    {!saved && (
                      <Text
                        style={[styles.myPlaceSub, { color: colors.textSecondary }]}
                        numberOfLines={1}>
                        저장 안 됨
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              router.push('/chat');
            }}
            style={({ pressed }) => [
              styles.aiBanner,
              { backgroundColor: colors.surface, borderColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}>
            <MaterialCommunityIcons name="robot-outline" size={26} color={colors.tint} />
            <View style={styles.rowInfo}>
              <Text style={[styles.rowName, { color: colors.text }]}>AI에게 추천받기</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                코스, 장소를 대화로 골라보세요
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.tint} />
          </Pressable>

          {recent.length > 0 && (
            <>
              {sectionTitle(
                '최근 검색',
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setRecent([]);
                    clearRecentSearches();
                  }}>
                  <Text style={[styles.sectionAction, { color: colors.textSecondary }]}>
                    지우기
                  </Text>
                </Pressable>,
              )}
              {recent.map((entry) => {
                const key = recentKey(entry);
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      if (entry.type === 'place') goToPlace(entry.place);
                      else if (entry.type === 'course') goToCourse(entry.id, entry.name);
                      else goToKakaoPlace(entry.name, entry.address, entry.latitude, entry.longitude, entry.phone);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <View style={styles.rowIconWrap}>
                      {entry.type === 'place' ? (
                        <CategoryIcon category={entry.place.category} size={20} />
                      ) : entry.type === 'course' ? (
                        <MaterialCommunityIcons name="road-variant" size={20} color={colors.tint} />
                      ) : (
                        <Ionicons name="location-outline" size={20} color="#475569" />
                      )}
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {entry.type === 'place' ? entry.place.name : entry.name}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => removeRecentSearch(key).then(setRecent)}
                      style={styles.removeButton}>
                      <Ionicons name="close" size={15} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </>
          )}

          {!!user &&
            ((favorites?.places.length ?? 0) + (favorites?.general.length ?? 0)) > 0 && (
            <>
              {sectionTitle(
                '⭐ 즐겨찾기',
                <Pressable hitSlop={8} onPress={() => router.push('/favorites')}>
                  <Text style={[styles.sectionAction, { color: colors.tint }]}>더보기</Text>
                </Pressable>,
              )}
              {favorites!.places.slice(0, 5).map((p) => placeRow(p, 'fav'))}
              {favorites!.general
                .slice(0, Math.max(0, 5 - favorites!.places.length))
                .map((f) => (
                  <Pressable
                    key={`fav-general-${f.id}`}
                    onPress={() =>
                      goToKakaoPlace(f.name, f.address, f.latitude, f.longitude, f.phone)
                    }
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <View style={styles.rowIconWrap}>
                      <Ionicons name="location-outline" size={20} color="#475569" />
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text
                        style={[styles.rowSub, { color: colors.textSecondary }]}
                        numberOfLines={1}>
                        {f.address}
                      </Text>
                    </View>
                    <Text style={[styles.rowBadge, { color: colors.textSecondary }]}>일반</Text>
                  </Pressable>
                ))}
            </>
          )}

          {(recommended?.recent.length ?? 0) > 0 && (
            <>
              {sectionTitle('새로 추가')}
              {recommended!.recent.slice(0, 5).map((p) => placeRow(p, 'new'))}
            </>
          )}

          {(recommended?.topRated.length ?? 0) > 0 && (
            <>
              {sectionTitle('라이더 추천')}
              {recommended!.topRated.slice(0, 5).map((p) => placeRow(p, 'top'))}
            </>
          )}
        </ScrollView>
      )}

      <PointSearchModal
        visible={editingSlot !== null}
        allowCurrent={false}
        title={editingSlot === 'home' ? '집 설정' : '회사 설정'}
        onClose={() => setEditingSlot(null)}
        onSelect={handleSlotSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rowIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 4,
  },
  backButton: {
    padding: 6,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  inputAction: {
    paddingLeft: 8,
  },
  listContent: {
    paddingBottom: 40,
  },
  noResult: {
    padding: 24,
    textAlign: 'center',
    fontSize: 14,
  },
  myPlacesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  myPlaceCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  myPlaceIcon: {
    fontSize: 18,
  },
  myPlaceLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  myPlaceSub: {
    fontSize: 11,
    marginTop: 1,
  },
  kakaoAttribution: {
    fontSize: 11,
    textAlign: 'right',
    paddingVertical: 8,
    paddingRight: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '600',
  },
  anchorNotice: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  browseAreaCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    padding: 13,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  browseAreaTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowReason: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 12,
  },
  rowBadge: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 8,
  },
  removeButton: {
    padding: 4,
    marginLeft: 8,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  landingSkeleton: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  landingPlaceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  landingRowSkeleton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  landingRowBody: {
    flex: 1,
  },
});

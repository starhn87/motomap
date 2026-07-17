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
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { searchAll } from '@/lib/api/search';
import { fetchFavoritePlaces } from '@/lib/api/favorites';
import { useRecommendedPlaces } from '@/hooks/usePlaces';
import { useAuthStore } from '@/stores/useAuthStore';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { openNavigation } from '@/lib/navigation';
import { toast } from '@/lib/toast';
import { Alert } from 'react-native';
import { formatDistance } from '@/constants/course';
import {
  loadRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  recentKey,
  type RecentSearch,
} from '@/lib/recentSearches';
import type { Place } from '@/types';

// 검색 전용 화면 — 입력 전에는 최근 검색·즐겨찾기·추천 목적지를 모아 보여주고,
// 2자 이상 입력하면 통합 검색 결과로 전환된다. 장소 선택은 지도 탭의
// focusPlaceId 파라미터(승인 푸시 딥링크와 같은 경로)로 전달한다.
export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  useEffect(() => {
    loadRecentSearches().then(setRecent);
  }, []);

  // 내 장소(집·회사) — 기기 로컬 저장. 탭하면 바로 길안내, 길게 누르면 삭제
  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const removeMyPlace = useMyPlacesStore((s) => s.remove);
  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  const handleMyPlace = (slot: MyPlaceSlot) => {
    const saved = myPlaces[slot];
    if (!saved) {
      toast.info(
        slot === 'home' ? '집이 아직 저장되지 않았어요.' : '회사가 아직 저장되지 않았어요.',
        '장소 검색이나 지도에서 카드의 ⭐로 저장할 수 있어요.',
      );
      return;
    }
    Keyboard.dismiss();
    void openNavigation({
      name: saved.name,
      latitude: saved.latitude,
      longitude: saved.longitude,
    });
  };

  const handleMyPlaceLongPress = (slot: MyPlaceSlot) => {
    const saved = myPlaces[slot];
    if (!saved) return;
    Alert.alert(slot === 'home' ? '집 삭제' : '회사 삭제', `${saved.name}\n저장을 해제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void removeMyPlace(slot) },
    ]);
  };

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => searchAll(trimmed),
    enabled: searching,
  });

  // "일반 장소" — DB(라이더 특화 장소)에 없는 곳도 카카오 로컬로 찾아 목적지로 쓸 수 있게
  const { data: kakaoResults } = useQuery({
    queryKey: ['search-kakao', trimmed],
    queryFn: () => searchKakaoLocal(trimmed),
    enabled: searching,
  });

  const { data: favorites } = useQuery({
    queryKey: ['favorites', 'places', user?.id],
    queryFn: fetchFavoritePlaces,
    enabled: !!user,
  });

  const { data: recommended } = useRecommendedPlaces();

  const goToPlace = useCallback((place: Place) => {
    Keyboard.dismiss();
    addRecentSearch({ type: 'place', place });
    // 같은 장소를 연속 선택해도 지도가 반응하도록 focusTs 로 매번 다른 키를 만든다
    router.navigate({
      pathname: '/',
      params: { focusPlaceId: place.id, focusTs: String(Date.now()) },
    });
  }, []);

  const goToKakaoPlace = useCallback(
    (name: string, address: string, latitude: number, longitude: number) => {
      Keyboard.dismiss();
      addRecentSearch({ type: 'kakao', name, address, latitude, longitude });
      router.navigate({
        pathname: '/',
        params: {
          kakaoName: name,
          kakaoAddress: address,
          kakaoLat: String(latitude),
          kakaoLng: String(longitude),
          focusTs: String(Date.now()),
        },
      });
    },
    [],
  );

  const goToCourse = useCallback((courseId: string, courseName: string) => {
    Keyboard.dismiss();
    addRecentSearch({ type: 'course', id: courseId, name: courseName });
    router.push(`/course/${courseId}`);
  }, []);

  const placeRow = (place: Place, keyPrefix: string) => {
    const cat = CATEGORIES[place.category];
    return (
      <Pressable
        key={`${keyPrefix}-${place.id}`}
        onPress={() => goToPlace(place)}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={styles.rowIcon}>{cat.icon}</Text>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {place.address}
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
          <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
        </Pressable>
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.tint },
          ]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="장소, 코스 검색"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={[styles.clearText, { color: colors.textSecondary }]}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {searching ? (
        // 검색 결과
        isLoading ? (
          <ActivityIndicator size="small" color={colors.tint} style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={[
              ...(results?.places.map((p) => ({ type: 'place' as const, data: p })) ?? []),
              ...(results?.courses.map((c) => ({ type: 'course' as const, data: c })) ?? []),
              ...(kakaoResults?.length
                ? [
                    { type: 'kakao-header' as const, data: null },
                    ...kakaoResults.map((k) => ({ type: 'kakao' as const, data: k })),
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
            renderItem={({ item }) =>
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
                      onPress={() => goToKakaoPlace(k.placeName, k.roadAddress || k.address, k.latitude, k.longitude)}
                      style={({ pressed }) => [
                        styles.row,
                        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <Text style={styles.rowIcon}>📍</Text>
                      <View style={styles.rowInfo}>
                        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                          {k.placeName}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                          {k.roadAddress || k.address}
                        </Text>
                      </View>
                      <Text style={[styles.rowBadge, { color: colors.textSecondary }]}>일반</Text>
                    </Pressable>
                  );
                })()
              ) : item.type === 'place' ? (
                placeRow(item.data as Place, 'result')
              ) : (
                <Pressable
                  onPress={() => goToCourse(item.data.id, item.data.name)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Text style={styles.rowIcon}>🛣️</Text>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {item.data.name}
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
                  onLongPress={() => handleMyPlaceLongPress(slot)}
                  style={({ pressed }) => [
                    styles.myPlaceCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Text style={styles.myPlaceIcon}>{slot === 'home' ? '🏠' : '🏢'}</Text>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.myPlaceLabel, { color: colors.text }]}>
                      {slot === 'home' ? '집' : '회사'}
                    </Text>
                    <Text
                      style={[styles.myPlaceSub, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {saved ? saved.name : '저장 안 됨'}
                    </Text>
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
            <Text style={styles.aiBannerIcon}>🤖</Text>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowName, { color: colors.text }]}>AI에게 추천받기</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                코스, 장소를 대화로 골라보세요
              </Text>
            </View>
            <Text style={[styles.aiBannerArrow, { color: colors.tint }]}>→</Text>
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
                      else goToKakaoPlace(entry.name, entry.address, entry.latitude, entry.longitude);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Text style={styles.rowIcon}>
                      {entry.type === 'place'
                        ? CATEGORIES[entry.place.category].icon
                        : entry.type === 'course'
                          ? '🛣️'
                          : '📍'}
                    </Text>
                    <View style={styles.rowInfo}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {entry.type === 'place' ? entry.place.name : entry.name}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => removeRecentSearch(key).then(setRecent)}
                      style={styles.removeButton}>
                      <Text style={[styles.removeText, { color: colors.textSecondary }]}>✕</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </>
          )}

          {!!user && (favorites?.length ?? 0) > 0 && (
            <>
              {sectionTitle(
                '⭐ 즐겨찾기',
                <Pressable hitSlop={8} onPress={() => router.push('/favorites')}>
                  <Text style={[styles.sectionAction, { color: colors.tint }]}>더보기</Text>
                </Pressable>,
              )}
              {favorites!.slice(0, 5).map((p) => placeRow(p, 'fav'))}
            </>
          )}

          {(recommended?.recent.length ?? 0) > 0 && (
            <>
              {sectionTitle('🆕 새로 오픈')}
              {recommended!.recent.slice(0, 5).map((p) => placeRow(p, 'new'))}
            </>
          )}

          {(recommended?.topRated.length ?? 0) > 0 && (
            <>
              {sectionTitle('👍 라이더 추천')}
              {recommended!.topRated.slice(0, 5).map((p) => placeRow(p, 'top'))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  backIcon: {
    fontSize: 22,
    fontWeight: '600',
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
  clearText: {
    fontSize: 16,
    fontWeight: '600',
    padding: 4,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowIcon: {
    fontSize: 20,
    marginRight: 12,
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
  removeText: {
    fontSize: 13,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aiBannerIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  aiBannerArrow: {
    fontSize: 18,
    fontWeight: '700',
  },
});

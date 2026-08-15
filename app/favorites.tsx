import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import CategoryIcon from '@/components/ui/CategoryIcon';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors, { semantic } from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchFavoritePlaces, type GeneralFavorite } from '@/lib/api/favorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { focusPlaceOnMap } from '@/lib/mapFocus';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import type { Place } from '@/types';
import { useCourseLibrary } from '@/hooks/useCourseLibrary';
import type { CourseLibraryItem } from '@/lib/api/courseLibrary';
import { formatDistance, formatDuration } from '@/constants/course';

function PlaceSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonContainer key={i}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Skeleton width={70} height={18} radius={10} />
            <Skeleton width={40} height={16} />
          </View>
          <Skeleton width="80%" height={18} />
          <Skeleton width="60%" height={14} style={{ marginTop: 6 }} />
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function FavoritesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const [segment, setSegment] = useState<'places' | 'courses'>('places');

  const { data: places, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['favorites', 'places', user?.id],
    queryFn: fetchFavoritePlaces,
  });
  const {
    data: courseLibrary,
    isLoading: coursesLoading,
    refetch: refetchCourses,
    isRefetching: coursesRefetching,
  } = useCourseLibrary();

  // 등록 장소와 일반 장소를 한 목록으로 — 사용자에겐 둘 다 "내 즐겨찾기"다.
  // 일반 장소는 카테고리·평점이 없어 뱃지 자리를 중립 라벨로 채운다.
  type Row =
    | { kind: 'place'; place: Place }
    | { kind: 'general'; fav: GeneralFavorite }
    | { kind: 'course'; item: CourseLibraryItem };

  const placeRows: Row[] = [
    ...(places?.places ?? []).map((place) => ({ kind: 'place' as const, place })),
    ...(places?.general ?? []).map((fav) => ({ kind: 'general' as const, fav })),
  ];
  const courseRows: Row[] = (courseLibrary ?? []).map((item) => ({ kind: 'course' as const, item }));
  const rows = segment === 'places' ? placeRows : courseRows;

  const renderGeneral = ({ fav }: { fav: GeneralFavorite }) => (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={() =>
        // 바로 길안내로 튀지 않고 지도의 장소 카드를 먼저 보여준다 — 주소·전화를
        // 확인하고 거기서 길안내로 이어가는 편이 자연스럽다.
        router.navigate({
          pathname: '/',
          params: {
            kakaoName: fav.name,
            kakaoAddress: fav.address,
            kakaoLat: String(fav.latitude),
            kakaoLng: String(fav.longitude),
            kakaoPhone: fav.phone ?? '',
            focusTs: String(Date.now()),
          },
        })
      }>
      <View style={styles.cardHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>일반</Text>
        </View>
      </View>
      <Text style={[styles.placeName, { color: colors.text }]}>{fav.name}</Text>
      <Text style={[styles.placeAddress, { color: colors.textSecondary }]}>{fav.address}</Text>
    </Pressable>
  );

  const renderPlace = ({ item }: { item: Place }) => {
    const category = CATEGORIES[item.category];

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={() => focusPlaceOnMap(item.id, { source: 'favorite' })}>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: category.color + '20' },
            ]}>
            <CategoryIcon category={item.category} size={14} color={category.color} />
            <Text style={[styles.categoryLabel, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
          {item.rating > 0 && (
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingStar}>★</Text>
              <Text style={[styles.ratingText, { color: colors.text }]}>
                {item.rating}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.placeName, { color: colors.text }]}>
          {item.name}
        </Text>
        <Text style={[styles.placeAddress, { color: colors.textSecondary }]}>
          {item.address}
        </Text>
      </Pressable>
    );
  };

  const renderCourse = ({ item }: { item: CourseLibraryItem }) => (
    <Pressable
      onPress={() => router.push(`/course/${item.course.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.courseBadgeRow}>
        {item.saved && (
          <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="bookmark" size={13} color={colors.text} />
            <Text style={[styles.categoryLabel, { color: colors.text }]}>저장</Text>
          </View>
        )}
        {item.completionCount > 0 && (
          <View style={[styles.categoryBadge, { backgroundColor: `${semantic.success}18` }]}>
            <Ionicons name="checkmark-circle" size={13} color={semantic.success} />
            <Text style={[styles.categoryLabel, { color: semantic.success }]}>완주 {item.completionCount}회</Text>
          </View>
        )}
      </View>
      <Text style={[styles.placeName, { color: colors.text }]}>{item.course.name}</Text>
      <Text style={[styles.placeAddress, { color: colors.textSecondary }]} numberOfLines={1}>
        {formatDistance(item.course.distance)} · {formatDuration(item.course.duration)}
        {item.course.routeName ? ` · ${item.course.routeName}` : ''}
      </Text>
    </Pressable>
  );

  const renderItem = ({ item }: { item: Row }) =>
    item.kind === 'place'
      ? renderPlace({ item: item.place })
      : item.kind === 'course'
        ? renderCourse({ item: item.item })
        : renderGeneral(item);

  const loading = segment === 'places' ? isLoading : coursesLoading;
  const refreshing = segment === 'places' ? isRefetching : coursesRefetching;
  const refresh = segment === 'places' ? refetch : refetchCourses;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.segmentRow}>
        {(['places', 'courses'] as const).map((value) => {
          const active = segment === value;
          return (
            <Pressable
              key={value}
              onPress={() => setSegment(value)}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.tint : colors.surface,
                  borderColor: active ? colors.tint : colors.border,
                },
              ]}>
              <Text style={[styles.segmentText, { color: active ? colors.background : colors.textSecondary }]}>
                {value === 'places' ? '장소' : '코스 기록'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <PlaceSkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={segment === 'places'
            ? <Ionicons name="star-outline" size={44} color={colors.textSecondary} />
            : <MaterialCommunityIcons name="road-variant" size={44} color={colors.textSecondary} />}
          title={segment === 'places' ? '즐겨찾기한 장소가 없습니다' : '저장하거나 완주한 코스가 없습니다'}
          hint={segment === 'places' ? '지도에서 장소를 탭하고 별 버튼을 눌러보세요.' : '코스를 저장하거나 길안내로 완주하면 여기에 모여요.'}
          actionLabel={segment === 'places' ? '지도에서 찾아보기' : '코스 둘러보기'}
          onAction={() => segment === 'places' ? router.navigate('/') : router.navigate('/courses')}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) =>
            item.kind === 'place'
              ? `place-${item.place.id}`
              : item.kind === 'course'
                ? `course-${item.item.course.id}`
                : `general-${item.fav.id}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.tint}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  courseBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 9,
  },
  categoryBadge: {
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 13,
    color: semantic.star,
    marginRight: 2,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  placeName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  placeAddress: {
    fontSize: 13,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
  },
});

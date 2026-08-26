import Ionicons from '@expo/vector-icons/Ionicons';
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
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors, { semantic } from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchFavoritePlaces, type GeneralFavorite } from '@/lib/api/favorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import type { Place } from '@/types';

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

  const { data: places, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['favorites', 'places', user?.id],
    queryFn: fetchFavoritePlaces,
  });

  // 등록 장소와 일반 장소를 한 목록으로 — 사용자에겐 둘 다 "내 즐겨찾기"다.
  // 일반 장소는 카테고리·평점이 없어 뱃지 자리를 중립 라벨로 채운다.
  type Row =
    | { kind: 'place'; place: Place }
    | { kind: 'general'; fav: GeneralFavorite };

  const rows: Row[] = [
    ...(places?.places ?? []).map((place) => ({ kind: 'place' as const, place })),
    ...(places?.general ?? []).map((fav) => ({ kind: 'general' as const, fav })),
  ];

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
        focusPointOnMap({
          name: fav.name,
          address: fav.address,
          latitude: fav.latitude,
          longitude: fav.longitude,
          phone: fav.phone,
          providerId: fav.providerId,
          placeUrl: fav.placeUrl,
          generalPlaceId: fav.generalPlaceId,
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

  const renderItem = ({ item }: { item: Row }) =>
    item.kind === 'place'
      ? renderPlace({ item: item.place })
      : renderGeneral(item);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <PlaceSkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="star-outline" size={44} color={colors.textSecondary} />}
          title="즐겨찾기한 장소가 없습니다"
          hint="지도에서 장소를 탭하고 별 버튼을 눌러보세요."
          actionLabel="지도에서 찾아보기"
          onAction={() => router.navigate('/')}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) =>
            item.kind === 'place'
              ? `place-${item.place.id}`
              : `general-${item.fav.id}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
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

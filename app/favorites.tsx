import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchFavoritePlaces } from '@/lib/api/favorites';
import { openNavigation } from '@/lib/navigation';
import type { Place } from '@/types';

export default function FavoritesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { data: places, isLoading } = useQuery({
    queryKey: ['favorites', 'places'],
    queryFn: fetchFavoritePlaces,
  });

  const renderItem = ({ item }: { item: Place }) => {
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
        onPress={() =>
          openNavigation({
            name: item.name,
            latitude: item.latitude,
            longitude: item.longitude,
          })
        }>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: category.color + '20' },
            ]}>
            <Text style={styles.categoryIcon}>{category.icon}</Text>
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator
          size="large"
          color={colors.tint}
          style={{ marginTop: 40 }}
        />
      ) : !places?.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            즐겨찾기한 장소가 없습니다.
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            지도에서 장소를 탭하고 ❤️ 버튼을 눌러보세요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
    color: '#FBBF24',
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

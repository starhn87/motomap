import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchMySubmissions } from '@/lib/api/mydata';
import type { Place } from '@/types';

export default function MySubmissionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: places, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: fetchMySubmissions,
  });

  const renderItem = ({ item }: { item: Place }) => {
    const category = CATEGORIES[item.category];

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: category.color + '20' }]}>
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text style={[styles.categoryLabel, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.approved ? '#22C55E20' : '#71717A20' },
            ]}>
            <Text
              style={[
                styles.statusText,
                { color: item.approved ? '#22C55E' : '#71717A' },
              ]}>
              {item.approved ? '승인됨' : '대기중'}
            </Text>
          </View>
        </View>
        <Text style={[styles.placeName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.placeAddress, { color: colors.textSecondary }]}>
          {item.address}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {new Date(item.createdAt).toLocaleDateString('ko-KR')}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
      ) : !places?.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            제보한 장소가 없습니다.
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            제보 탭에서 바이커 장소를 제보해보세요!
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
  container: { flex: 1 },
  list: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
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
  categoryIcon: { fontSize: 11, marginRight: 4 },
  categoryLabel: { fontSize: 11, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  placeName: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  placeAddress: { fontSize: 13, marginBottom: 4 },
  date: { fontSize: 11 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});

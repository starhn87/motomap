import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchMyReviews } from '@/lib/api/mydata';
import StarRating from '@/components/review/StarRating';

export default function MyReviewsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: reviews, isLoading } = useQuery({
    queryKey: ['my-reviews'],
    queryFn: fetchMyReviews,
  });

  const renderItem = ({ item }: { item: any }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.placeName, { color: colors.tint }]}>
          {item.placeName}
        </Text>
        <StarRating rating={item.rating} size={14} readonly />
      </View>
      {item.content ? (
        <Text style={[styles.content, { color: colors.text }]}>
          {item.content}
        </Text>
      ) : null}
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {new Date(item.createdAt).toLocaleDateString('ko-KR')}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
      ) : !reviews?.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            작성한 리뷰가 없습니다.
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            장소를 방문하고 리뷰를 남겨보세요!
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
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
  placeName: { fontSize: 15, fontWeight: '700' },
  content: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  date: { fontSize: 11 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryIcon from '@/components/ui/CategoryIcon';
import { useNearbyPlacesOf } from '@/hooks/usePlaces';
import { focusPlaceOnMap } from '@/lib/mapFocus';
import { haversine } from '@/lib/distance';
import { formatMeters } from '@/lib/api/directions';
import type { Place } from '@/types';

// 장소 상세의 "근처 다른 장소" — 여기서 저기로 발견이 이어지게 한다.
// 근처가 없으면 아무것도 그리지 않는다.
export default function NearbyPlaces({ place }: { place: Place }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: nearby = [] } = useNearbyPlacesOf(place);

  if (nearby.length === 0) return null;

  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>근처 다른 장소</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.cards}>
          {nearby.map((near) => (
            <Pressable
              key={near.id}
              onPress={() => focusPlaceOnMap(near.id, { place: near })}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <View style={styles.cardHeader}>
                <CategoryIcon category={near.category} size={16} />
                <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                  {near.name}
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                {CATEGORIES[near.category].label} · {formatMeters(haversine(place, near))}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  // 시트 콘텐츠 패딩(20)을 상쇄해 가장자리까지 흘린다 — 끝에 걸친 카드가
  // 스크롤 가능함을 알려주고, 패딩에 잘리지도 않는다
  scroll: {
    marginHorizontal: -20,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  cards: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    width: 150,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  cardSub: {
    fontSize: 12,
  },
});

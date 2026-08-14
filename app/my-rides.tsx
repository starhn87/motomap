import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import { useMyRides } from '@/hooks/usePlaceRides';
import EmptyState from '@/components/ui/EmptyState';
import type { MyRidePlace } from '@/lib/api/rides';

// "8.10" — 목록에 연도까지는 과하고, 해가 바뀐 기록만 "24.12" 처럼 연도를 붙인다
function shortDate(iso: string): string {
  const d = new Date(iso);
  const thisYear = new Date().getFullYear();
  const md = `${d.getMonth() + 1}.${d.getDate()}`;
  return d.getFullYear() === thisYear ? md : `${d.getFullYear() % 100}.${md}`;
}

// 라이딩 기록 — 길안내로 실제 도착한 장소별 횟수. 내 바이크 화면의 요약
// 카드를 탭하면 온다. 등록 장소는 탭해서 지도의 그 장소로 바로 간다.
export default function MyRidesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: rides, isLoading } = useMyRides();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  if (!rides?.length) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={<Text style={styles.emptyEmoji}>🏍️</Text>}
          title="아직 라이딩 기록이 없습니다"
          hint="길안내로 도착하면 자동으로 기록돼요."
        />
      </View>
    );
  }

  const renderItem = ({ item }: { item: MyRidePlace }) => {
    const detail = [
      item.goals > 0 ? `도착 ${item.goals}` : null,
      item.vias > 0 ? `경유 ${item.vias}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    // 등록 장소는 그 장소로, 미등록 목적지도 기록된 좌표의 일반 장소 카드로 —
    // 어느 행이든 탭하면 지도에서 그 자리를 보여준다
    const openOnMap = () => {
      if (item.placeId) {
        focusPlaceOnMap(item.placeId, { source: 'my_rides' });
      } else if (item.latitude != null && item.longitude != null) {
        focusPointOnMap({ name: item.name, latitude: item.latitude, longitude: item.longitude });
      }
    };
    return (
      <Pressable
        onPress={openOnMap}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}>
        <View style={styles.rowBody}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
            {detail} · 마지막 {shortDate(item.lastAt)}
          </Text>
        </View>
        <Text style={[styles.rowCount, { color: colors.text }]}>{item.total}회</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={rides}
      keyExtractor={(item) => item.placeId ?? `pt:${item.name}`}
      ListHeaderComponent={
        // 통계 RPC 는 미등록 장소를 '곳' 수에서 빼므로 목록과 어긋난다 — 목록 기준으로 센다
        <Text style={[styles.summary, { color: colors.textSecondary }]}>
          지금까지 {rides.length}곳에서 {rides.reduce((n, r) => n + r.total, 0)}번 라이딩했어요
        </Text>
      }
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  summary: {
    fontSize: 13.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowDetail: {
    fontSize: 12.5,
  },
  rowCount: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});

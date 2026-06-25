import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDistance, formatRideDuration } from '@/constants/course';
import type { RideStats, RideStatsBucket } from '@/lib/rideStats';

function Bucket({
  label,
  bucket,
  color,
  sub,
}: {
  label: string;
  bucket: RideStatsBucket;
  color: string;
  sub: string;
}) {
  return (
    <View style={styles.bucket}>
      <Text style={[styles.bucketLabel, { color: sub }]}>{label}</Text>
      <Text style={[styles.bucketDistance, { color }]}>
        {formatDistance(bucket.distanceKm)}
      </Text>
      <Text style={[styles.bucketMeta, { color: sub }]}>
        {formatRideDuration(bucket.durationSec)} · {bucket.count}회
      </Text>
    </View>
  );
}

export default function RideStatsSummary({ stats }: { stats: RideStats }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const max = Math.max(...stats.weeklyTrend.map((w) => w.distanceKm), 0.1);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <View style={styles.row}>
        <Bucket
          label="이번 주"
          bucket={stats.thisWeek}
          color={colors.text}
          sub={colors.textSecondary}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Bucket
          label="이번 달"
          bucket={stats.thisMonth}
          color={colors.text}
          sub={colors.textSecondary}
        />
      </View>

      <Text style={[styles.trendLabel, { color: colors.textSecondary }]}>
        최근 8주 거리
      </Text>
      <View style={styles.bars}>
        {stats.weeklyTrend.map((w) => {
          const h = w.distanceKm > 0 ? Math.max(4, 44 * (w.distanceKm / max)) : 2;
          return (
            <View key={w.weekStartMs} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor:
                      w.distanceKm > 0 ? colors.tint : colors.border,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  bucket: { flex: 1, alignItems: 'center' },
  bucketLabel: { fontSize: 12, marginBottom: 4 },
  bucketDistance: { fontSize: 22, fontWeight: '800' },
  bucketMeta: { fontSize: 12, marginTop: 2 },
  divider: { width: 1, height: 48 },
  trendLabel: { fontSize: 12, marginTop: 16, marginBottom: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 6 },
  barCol: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', borderRadius: 3, minHeight: 2 },
});

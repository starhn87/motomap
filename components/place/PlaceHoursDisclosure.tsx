import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import OpenBadge from '@/components/place/OpenBadge';
import { formatDailyHours, type Hours } from '@/lib/hours';
import type { PlaceOperationalStatus } from '@/types';

export function PlaceHoursToggle({ hours, businessStatus, operationalStatus, expanded, onToggle }: {
  hours?: Hours | null; businessStatus?: string | null; operationalStatus?: PlaceOperationalStatus;
  expanded: boolean; onToggle: () => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '운영시간 접기' : '운영시간 펼치기'}
      accessibilityState={{ expanded }} onPress={onToggle}
      style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.badge}>
        <OpenBadge hours={hours} businessStatus={businessStatus} operationalStatus={operationalStatus} inline fallbackText="운영시간" />
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textSecondary} />
    </Pressable>
  );
}

export function PlaceHoursDetails({ expanded, hours, fallbackText, loading, failed }: {
  expanded: boolean; hours?: Hours | null; fallbackText?: string | null; loading?: boolean; failed?: boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  if (!expanded) return null;
  const days = hours ? formatDailyHours(hours) : [];
  const description = fallbackText || (hours?.note ? null : failed ? '운영시간을 확인하지 못했어요.' : '등록된 운영시간이 없어요.');
  return (
    <View style={styles.details}>
      {loading && !days.length && !fallbackText ? <ActivityIndicator size="small" color={colors.tint} /> :
        days.length ? days.map(day => (
          <View key={day.day} style={styles.dayRow}>
            <Text style={[styles.day, { color: colors.textSecondary }]}>{day.label}요일</Text>
            <Text style={[styles.hours, { color: colors.text }]}>{day.value}</Text>
          </View>
        )) : description ? <Text style={{ color: colors.textSecondary }}>{description}</Text> : null}
      {!!hours?.note && <Text style={[styles.note, { color: colors.textSecondary }]}>{hours.note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, minHeight: 40 },
  badge: { flex: 1, minWidth: 0 },
  details: { marginBottom: 12, gap: 6 },
  dayRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  day: { width: 42, fontSize: 14, lineHeight: 21 },
  hours: { flex: 1, fontSize: 14, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 20, marginTop: 2 },
});

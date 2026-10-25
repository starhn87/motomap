import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDailyHours, type Hours } from '@/lib/hours';

export function hasPlaceHours(hours?: Hours | null, fallbackText?: string | null) {
  return !!(hours && formatDailyHours(hours).length) || !!hours?.note?.trim() || !!fallbackText?.trim();
}

export function PlaceHoursToggle({ expanded, onToggle }: {
  expanded: boolean; onToggle: () => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '운영시간 접기' : '운영시간 펼치기'}
      accessibilityState={{ expanded }} onPress={onToggle}
      style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
      <Text style={[styles.label, { color: colors.text }]}>운영시간</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

export function PlaceHoursRow({ hours, fallbackText, expanded, onToggle }: {
  hours?: Hours | null; fallbackText?: string | null; expanded: boolean; onToggle: () => void;
}) {
  if (!hasPlaceHours(hours, fallbackText)) return null;
  return <View>
    <PlaceHoursToggle expanded={expanded} onToggle={onToggle} />
    <PlaceHoursDetails expanded={expanded} hours={hours} fallbackText={fallbackText} />
  </View>;
}

export function PlaceHoursDetails({ expanded, hours, fallbackText }: {
  expanded: boolean; hours?: Hours | null; fallbackText?: string | null;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  if (!expanded || !hasPlaceHours(hours, fallbackText)) return null;
  const days = hours ? formatDailyHours(hours) : [];
  const description = fallbackText?.trim();
  return (
    <View style={styles.details}>
      {days.length ? days.map(day => (
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  label: { flex: 1, fontSize: 14 },
  details: { marginBottom: 12, gap: 6 },
  dayRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  day: { width: 42, fontSize: 14, lineHeight: 21 },
  hours: { flex: 1, fontSize: 14, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 20, marginTop: 2 },
});

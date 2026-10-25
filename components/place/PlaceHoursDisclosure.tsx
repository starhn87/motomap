import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import OpenBadge, { placeStatusLabel } from '@/components/place/OpenBadge';
import type { PlaceOperationalStatus } from '@/types';
import { formatDailyHours, type Hours } from '@/lib/hours';

export function hasPlaceHours(hours?: Hours | null, fallbackText?: string | null) {
  return !!(hours && formatDailyHours(hours).length) || !!hours?.note?.trim() || !!fallbackText?.trim();
}

type HoursRowProps = {
  hours?: Hours | null; fallbackText?: string | null;
  businessStatus?: string | null; operationalStatus?: PlaceOperationalStatus;
  expanded: boolean; onToggle: () => void;
};

export function PlaceHoursToggle({ hours, businessStatus, operationalStatus, expanded, onToggle }: HoursRowProps) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '운영시간 접기' : '운영시간 펼치기'}
      accessibilityState={{ expanded }} onPress={onToggle}
      style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
      <OpenBadge hours={hours} businessStatus={businessStatus} operationalStatus={operationalStatus}
        inline inlineStart fallbackText="운영시간" />
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

export function PlaceHoursRow({ hours, fallbackText, businessStatus, operationalStatus, expanded, onToggle }: HoursRowProps) {
  const hasHours = hasPlaceHours(hours, fallbackText);
  const colors = Colors[useColorScheme() ?? 'light'];
  if (!hasHours) {
    // 시간표가 없어도 확인된 휴업·폐업·이전 사실은 숨기지 않는다.
    if (!placeStatusLabel(businessStatus, operationalStatus)) return null;
    return <View style={styles.toggle}>
      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
      <OpenBadge businessStatus={businessStatus} operationalStatus={operationalStatus} inline inlineStart />
    </View>;
  }
  return <View>
    <PlaceHoursToggle hours={hours} businessStatus={businessStatus} operationalStatus={operationalStatus}
      expanded={expanded} onToggle={onToggle} />
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  details: { marginBottom: 12, gap: 6 },
  dayRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  day: { width: 42, fontSize: 14, lineHeight: 21 },
  hours: { flex: 1, fontSize: 14, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 20, marginTop: 2 },
});

import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMeters, formatSeconds } from '@/lib/api/directions';
import type { BikeRoute, RoutePriority } from '@/modules/kakao-navi';

type Alternative = {
  value: RoutePriority;
  label: string;
  route?: BikeRoute;
  vias?: number[];
  error?: string;
  loading: boolean;
};

export default function RouteAlternatives({ options, priority, requestedViaCount, disabled, onSelect }: {
  options: Alternative[];
  priority: RoutePriority;
  requestedViaCount: number;
  disabled: boolean;
  onSelect: (priority: RoutePriority) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const compact = useWindowDimensions().height < 740;
  const selected = options.find((option) => option.value === priority);
  return (
    <View style={styles.container}>
      <View style={[styles.grid, compact && styles.compactGrid]} accessibilityRole="radiogroup" accessibilityLabel="경로 비교">
        {options.map((option) => {
          const active = option.value === priority;
          const color = active ? colors.background : colors.text;
          const viaCount = (option.vias?.length ?? 0) / 2;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled, busy: option.loading }}
              disabled={disabled}
              onPress={() => onSelect(option.value)}
              style={[styles.option, compact && styles.compactOption, {
                backgroundColor: active ? colors.tint : colors.surfaceMuted,
                borderColor: active ? colors.tint : colors.border,
              }]}>
              <View style={styles.heading}>
                <Text style={[styles.label, { color }]}>{option.label}</Text>
                {active && !compact && <Ionicons name="checkmark-circle" size={16} color={color} />}
              </View>
              {option.route ? (
                <>
                  {compact ? (
                    <View style={styles.compactMetrics}>
                      <Text style={[styles.metrics, { color }]}>{formatSeconds(option.route.duration)}</Text>
                      <Text style={[styles.detail, { color }]}>{formatMeters(option.route.distance)}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.metrics, { color }]}>
                      {formatSeconds(option.route.duration)} · {formatMeters(option.route.distance)}
                    </Text>
                  )}
                  {requestedViaCount > 0 && (
                    <Text style={[styles.detail, { color }]}>
                      경유 {viaCount}개{viaCount < requestedViaCount ? ` · ${requestedViaCount - viaCount}개 제외` : ''}
                    </Text>
                  )}
                </>
              ) : option.loading ? (
                <View style={styles.loading}>
                  <ActivityIndicator size="small" color={color} accessibilityLabel={`${option.label} 경로 불러오는 중`} />
                </View>
              ) : (
                <Text style={[styles.detail, { color }]}>
                  {option.error ? '경로 확인 실패' : '선택하면 조회해요'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {selected?.route && (selected.vias?.length ?? 0) / 2 < requestedViaCount && (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>
          도로가 연결되지 않아 일부 경유지를 제외한 경로예요. 표시된 경유지로 안내해요.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactGrid: { flexWrap: 'nowrap', gap: 6 },
  option: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 10, gap: 5, minHeight: 72 },
  compactOption: { width: undefined, flex: 1, minWidth: 0, paddingHorizontal: 6 },
  compactMetrics: { gap: 2 },
  loading: { minHeight: 24, alignItems: 'flex-start', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  label: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  metrics: { fontSize: 14, fontWeight: '700' },
  detail: { fontSize: 12, lineHeight: 17 },
});

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const cardWidth = width > 0 ? (width - 44) / 2 : 136;
  const selectedIndex = options.findIndex(option => option.value === priority);
  useEffect(() => {
    if (selectedIndex >= 0) scroll.current?.scrollTo({ x: selectedIndex * (cardWidth + 8), animated: true });
  }, [selectedIndex, cardWidth]);
  const selected = options.find((option) => option.value === priority);
  const excludedViaCount = selected?.route ? Math.max(0, requestedViaCount - (selected.vias?.length ?? 0) / 2) : 0;
  let viaSummary = '경로를 선택하면 경유지를 확인할 수 있어요.';
  if (excludedViaCount > 0) viaSummary = `경유지 ${excludedViaCount}개 제외 · 표시된 경유지로 안내해요.`;
  else if (selected?.route) viaSummary = '지도에 표시된 경유지로 안내해요.';
  else if (selected?.loading) viaSummary = '경유지 포함 여부를 확인 중이에요.';
  else if (selected?.error) viaSummary = '다른 경로를 선택하거나 다시 시도해 주세요.';
  return (
    <View style={styles.container} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <ScrollView ref={scroll} style={styles.scroll} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row} accessibilityRole="radiogroup" accessibilityLabel="경로 비교">
        {options.map((option) => {
          const active = option.value === priority;
          const color = active ? colors.background : colors.text;
          const viaCount = (option.vias?.length ?? 0) / 2;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label}, ${option.route
                ? `${formatSeconds(option.route.duration)}, ${formatMeters(option.route.distance)}${requestedViaCount > 0 ? `, 경유 ${viaCount}개${viaCount < requestedViaCount ? `, ${requestedViaCount - viaCount}개 제외` : ''}` : ''}`
                : option.loading ? '경로 불러오는 중' : option.error ? '경로 확인 실패' : '선택하면 조회해요'}`}
              accessibilityState={{ checked: active, disabled, busy: option.loading }}
              disabled={disabled}
              onPress={() => onSelect(option.value)}
              style={[styles.option, { width: cardWidth,
                backgroundColor: active ? colors.tint : colors.surfaceMuted,
                borderColor: active ? colors.tint : colors.border,
              }]}>
              <View style={styles.heading}>
                <Text style={[styles.label, { color }]} numberOfLines={1}>{option.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={16} color={color} />}
              </View>
              {/* 같은 정보 줄을 유지해 조회 완료·실패 때 카드와 지도 영역이 밀리지 않게 한다. */}
              <View style={styles.summary}>
                <View>
                  <Text style={[styles.metrics, styles.placeholder]} numberOfLines={1}
                    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">0분</Text>
                  {option.route && (
                    <Text style={[styles.metrics, styles.content, { color }]} numberOfLines={1}
                      adjustsFontSizeToFit minimumFontScale={0.8}>
                      {formatSeconds(option.route.duration)}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={[styles.detail, styles.placeholder]} numberOfLines={1}
                    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">0km</Text>
                  {option.route && (
                    <Text style={[styles.detail, styles.content, { color }]} numberOfLines={1}
                      adjustsFontSizeToFit minimumFontScale={0.8}>
                      {formatMeters(option.route.distance)}
                    </Text>
                  )}
                </View>
                {requestedViaCount > 0 && (
                  <View>
                    <Text style={[styles.detail, styles.placeholder]} numberOfLines={1}
                      accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">경유 0개</Text>
                    {option.route && (
                      <Text style={[styles.detail, styles.content, { color }]} numberOfLines={1}>
                        경유 {viaCount}개{viaCount < requestedViaCount ? ` · ${requestedViaCount - viaCount}개 제외` : ''}
                      </Text>
                    )}
                  </View>
                )}
                {!option.route && (
                  <View style={styles.status}>
                    {option.loading ? (
                      <ActivityIndicator size="small" color={color} accessibilityLabel={`${option.label} 경로 불러오는 중`} />
                    ) : (
                      <Text style={[styles.detail, { color }]} numberOfLines={1}>
                        {option.error ? '경로 확인 실패' : '선택하면 조회해요'}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {requestedViaCount > 0 && (
        <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}
          accessibilityLabel={excludedViaCount > 0
            ? `도로가 연결되지 않아 경유지 ${excludedViaCount}개를 제외한 경로예요. 표시된 경유지로 안내해요.`
            : viaSummary}>
          {viaSummary}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  option: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  summary: { gap: 4 },
  placeholder: { opacity: 0 },
  content: { ...StyleSheet.absoluteFill },
  status: { ...StyleSheet.absoluteFill, alignItems: 'flex-start', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
  metrics: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  detail: { fontSize: 12, lineHeight: 17 },
});

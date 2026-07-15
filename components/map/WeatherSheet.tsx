import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useCallback } from 'react';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { RidingWeather } from '@/lib/api/weather';

interface Props {
  weather: RidingWeather;
  onClose: () => void;
}

// 라이딩 날씨 상세 바텀시트 — 적합도 등급·점수, 현재 조건, 6시간 예보
export default function WeatherSheet({ weather, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // 시트 밖 영역 탭으로 닫기 — 살짝 어둡게 깔리는 백드롭
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.25}
        pressBehavior="close"
      />
    ),
    [],
  );

  const stats = [
    { label: '기온', value: `${weather.current.temp}°` },
    { label: '체감', value: `${weather.current.feels}°` },
    { label: '강수확률', value: `${weather.current.pop}%` },
    { label: '바람', value: `${weather.current.windMs}m/s` },
    { label: '습도', value: `${weather.current.humidity}%` },
    { label: '상태', value: weather.current.condition },
  ];

  return (
    <BottomSheet
      snapPoints={['56%']}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.background,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.tabIconDefault }}>
      <BottomSheetView style={styles.content}>
        {/* 등급 헤더 */}
        <View style={styles.gradeRow}>
          <Text style={styles.gradeEmoji}>{weather.current.emoji}</Text>
          <View style={styles.gradeInfo}>
            <View style={styles.gradeTitleRow}>
              <Text style={[styles.gradeTitle, { color: weather.gradeColor }]}>
                라이딩 {weather.grade}
              </Text>
              <Text style={[styles.gradeScore, { color: colors.textSecondary }]}>
                {weather.score}점
              </Text>
            </View>
            <Text style={[styles.gradeComment, { color: colors.text }]}>{weather.comment}</Text>
          </View>
        </View>

        {/* 현재 조건 그리드 */}
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <View
              key={s.label}
              style={[styles.statCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* 12시간 예보 — 가로 스와이프 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.hourlyRow}>
            {weather.hourly.map((h) => (
              <View
                key={h.hour}
                style={[styles.hourCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>{h.hour}</Text>
                <Text style={styles.hourEmoji}>{h.emoji}</Text>
                <Text style={[styles.hourTemp, { color: colors.text }]}>{h.temp}°</Text>
                <Text
                  style={[
                    styles.hourPop,
                    { color: h.pop > 0 ? colors.tint : colors.textSecondary },
                  ]}>
                  💧{h.pop}%
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          현재 지도 위치 기준 · Open-Meteo
        </Text>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  gradeEmoji: {
    fontSize: 40,
  },
  gradeInfo: {
    flex: 1,
    gap: 2,
  },
  gradeTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  gradeTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  gradeScore: {
    fontSize: 13,
    fontWeight: '600',
  },
  gradeComment: {
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    flexBasis: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  hourlyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  hourCell: {
    alignItems: 'center',
    gap: 4,
    width: 62,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  hourLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  hourEmoji: {
    fontSize: 26,
  },
  hourTemp: {
    fontSize: 15,
    fontWeight: '700',
  },
  hourPop: {
    fontSize: 12,
    fontWeight: '600',
    minHeight: 14,
  },
  footnote: {
    fontSize: 11,
    textAlign: 'center',
  },
});

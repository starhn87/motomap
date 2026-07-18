import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useCallback } from 'react';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { useQuery } from '@tanstack/react-query';
import { coordToRegion } from '@/lib/api/kakaoLocal';
import { fetchAirQuality, AIR_GRADE_LABEL, AIR_GRADE_COLOR } from '@/lib/api/air';
import { sunTimes } from '@/lib/sun';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { RidingWeather } from '@/lib/api/weather';

interface Props {
  weather: RidingWeather;
  /** 예보 기준 좌표 — 하단에 동네 이름으로 표기해 "어디 날씨인지" 혼동을 없앤다 */
  latitude?: number;
  longitude?: number;
  onClose: () => void;
}

// 라이딩 날씨 상세 바텀시트 — 적합도 등급·점수, 현재 조건, 6시간 예보
export default function WeatherSheet({ weather, latitude, longitude, onClose }: Props) {
  const { data: region } = useQuery({
    queryKey: ['weather-region', latitude?.toFixed(2), longitude?.toFixed(2)],
    queryFn: () => coordToRegion(latitude!, longitude!),
    enabled: latitude != null && longitude != null,
    staleTime: 30 * 60 * 1000,
  });

  // 미세먼지 — 측정소 데이터가 시간 단위라 30분 캐시면 충분
  const { data: air } = useQuery({
    queryKey: ['air-quality', latitude?.toFixed(2), longitude?.toFixed(2)],
    queryFn: () => fetchAirQuality(latitude!, longitude!),
    enabled: latitude != null && longitude != null,
    staleTime: 30 * 60 * 1000,
  });

  const sun = latitude != null && longitude != null ? sunTimes(latitude, longitude) : null;

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

  const airStat = (grade: number | null | undefined, value: number | null | undefined) =>
    grade != null
      ? { text: AIR_GRADE_LABEL[grade] ?? '-', color: AIR_GRADE_COLOR[grade], sub: value != null ? `${value}` : undefined }
      : { text: '-', color: undefined, sub: undefined };
  const pm10 = airStat(air?.pm10Grade, air?.pm10);
  const pm25 = airStat(air?.pm25Grade, air?.pm25);

  const stats: { label: string; value: string; color?: string }[] = [
    { label: '기온', value: `${weather.current.temp}°` },
    { label: '체감', value: `${weather.current.feels}°` },
    { label: '강수확률', value: `${weather.current.pop}%` },
    { label: '바람', value: `${weather.current.windMs}m/s` },
    { label: '습도', value: `${weather.current.humidity}%` },
    { label: '상태', value: weather.current.condition },
    { label: '미세먼지', value: pm10.text, color: pm10.color },
    { label: '초미세먼지', value: pm25.text, color: pm25.color },
    { label: '일출과 일몰', value: sun ? `${sun.sunrise} ~ ${sun.sunset}` : '-' },
  ];

  return (
    <BottomSheet
      snapPoints={['62%']}
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
              <Text style={[styles.statValue, { color: s.color ?? colors.text }]}>{s.value}</Text>
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
                {/* 강수확률 0%는 표기 자체를 비운다 (자리는 유지해 셀 높이 정렬) */}
                <Text style={[styles.hourPop, { color: colors.tint }]}>
                  {h.pop > 0 ? `💧${h.pop}%` : ' '}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {region ?? '현재 지도 위치'} 기준 · 기상청 단기예보 · 에어코리아
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

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useCallback } from 'react';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { useQuery } from '@tanstack/react-query';
import Feather from '@expo/vector-icons/Feather';
import { coordToRegion } from '@/lib/api/kakaoLocal';
import { fetchAirQuality, AIR_GRADE_LABEL, AIR_GRADE_COLOR } from '@/lib/api/air';
import { sunEvents, type SunEvent } from '@/lib/sun';
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

// "05:24" → "5:24" (시간대별 스트립의 24시간제 표기와 톤을 맞춘다)
function toShortTime(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${Number(h)}:${m}`;
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

  // 일출·일몰은 아이폰 날씨처럼 시간대별 예보 사이에 끼워 넣는다
  const suns = latitude != null && longitude != null ? sunEvents(latitude, longitude) : [];

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
      ? {
          text: AIR_GRADE_LABEL[grade] ?? '-',
          color: AIR_GRADE_COLOR[grade],
          sub: value != null ? `${value}㎍/m³` : undefined,
        }
      : { text: '-', color: undefined, sub: undefined };
  const pm10 = airStat(air?.pm10Grade, air?.pm10);
  const pm25 = airStat(air?.pm25Grade, air?.pm25);

  const stats: { label: string; value: string; color?: string; sub?: string }[] = [
    { label: '기온', value: `${weather.current.temp}°` },
    { label: '체감', value: `${weather.current.feels}°` },
    { label: '강수확률', value: `${weather.current.pop}%` },
    { label: '바람', value: `${weather.current.windMs}m/s` },
    { label: '습도', value: `${weather.current.humidity}%` },
    { label: '상태', value: weather.current.condition },
    { label: '미세먼지', value: pm10.text, color: pm10.color, sub: pm10.sub },
    { label: '초미세먼지', value: pm25.text, color: pm25.color, sub: pm25.sub },
  ];

  // 시간대별 셀 목록에 일출·일몰 카드를 시각 순서대로 삽입 — hourly[i]는 첫 셀
  // 시각 + i 시간이므로, 이벤트가 속한 시간 셀 바로 뒤에 끼운다.
  const firstHour = parseInt(weather.hourly[0]?.hour ?? '0', 10);
  const firstStart = new Date();
  firstStart.setMinutes(0, 0, 0);
  firstStart.setHours(firstHour);
  const hourItems: ({ kind: 'hour'; h: (typeof weather.hourly)[number] } | { kind: 'sun'; e: SunEvent })[] = [];
  weather.hourly.forEach((h, i) => {
    hourItems.push({ kind: 'hour', h });
    const cellStart = firstStart.getTime() + i * 3600000;
    for (const e of suns) {
      if (e.at.getTime() >= cellStart && e.at.getTime() < cellStart + 3600000) {
        hourItems.push({ kind: 'sun', e });
      }
    }
  });

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
              {!!s.sub && (
                <Text style={[styles.statSub, { color: colors.textSecondary }]}>{s.sub}</Text>
              )}
            </View>
          ))}
        </View>

        {/* 12시간 예보 — 가로 스와이프 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.hourlyRow}>
            {hourItems.map((item) =>
              item.kind === 'hour' ? (
                <View
                  key={item.h.hour}
                  style={[styles.hourCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>{item.h.hour}</Text>
                  <Text style={styles.hourEmoji}>{item.h.emoji}</Text>
                  <Text style={[styles.hourTemp, { color: colors.text }]}>{item.h.temp}°</Text>
                  {/* 강수확률 0%는 표기 자체를 비운다 (자리는 유지해 셀 높이 정렬) */}
                  <Text style={[styles.hourPop, { color: colors.tint }]}>
                    {item.h.pop > 0 ? `💧${item.h.pop}%` : ' '}
                  </Text>
                </View>
              ) : (
                <View
                  key={`${item.e.type}-${item.e.time}`}
                  style={[styles.hourCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text
                    style={[styles.hourLabel, styles.sunTime, { color: colors.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {toShortTime(item.e.time)}
                  </Text>
                  <View style={styles.sunIcon}>
                    <Feather
                      name={item.e.type === 'sunrise' ? 'sunrise' : 'sunset'}
                      size={24}
                      color="#F59E0B"
                    />
                  </View>
                  <Text style={[styles.hourTemp, { color: colors.text }]}>
                    {item.e.type === 'sunrise' ? '일출' : '일몰'}
                  </Text>
                  <Text style={styles.hourPop}> </Text>
                </View>
              ),
            )}
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
  statSub: {
    fontSize: 11,
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
  sunTime: {
    fontWeight: '700',
    maxWidth: 58,
  },
  sunIcon: {
    height: 31,
    justifyContent: 'center',
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

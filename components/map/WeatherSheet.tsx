import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useCallback } from 'react';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { useQuery } from '@tanstack/react-query';
import Feather from '@expo/vector-icons/Feather';
import { coordToRegion, coordToRegionParts } from '@/lib/api/kakaoLocal';
import { fetchAirQuality, AIR_GRADE_LABEL, AIR_GRADE_COLOR } from '@/lib/api/air';
import { sunEvents, type SunEvent } from '@/lib/sun';
import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchWeatherWarnings, warningsForRegion, type RidingWeather } from '@/lib/api/weather';

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

// 일출·일몰 글리프 — 폰트 아이콘은 단색뿐이라 아이폰 날씨처럼 해(노랑·주황)와
// 수평선·화살표를 색을 나눠 View 로 직접 그린다
function SunGlyph({ type, lineColor, arrowColor }: { type: 'sunrise' | 'sunset'; lineColor: string; arrowColor: string }) {
  const sunColor = type === 'sunrise' ? '#FBBF24' : '#F97316';
  return (
    <View style={glyph.wrap}>
      <Feather
        name={type === 'sunrise' ? 'arrow-up' : 'arrow-down'}
        size={13}
        color={arrowColor}
        style={glyph.arrow}
      />
      <View style={glyph.sunRow}>
        {/* 해 중심에서 방사형으로 뻗는 광선 — 화살표(12시) 양옆으로 2개씩 */}
        <View style={[glyph.ray, glyph.rayL1, { backgroundColor: sunColor }]} />
        <View style={[glyph.ray, glyph.rayL2, { backgroundColor: sunColor }]} />
        <View style={[glyph.ray, glyph.rayR2, { backgroundColor: sunColor }]} />
        <View style={[glyph.ray, glyph.rayR1, { backgroundColor: sunColor }]} />
        <View style={[glyph.sun, { backgroundColor: sunColor }]} />
      </View>
      <View style={[glyph.horizon, { backgroundColor: lineColor }]} />
    </View>
  );
}

const glyph = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 1,
  },
  // 아이콘 뷰박스의 상하 여백을 상쇄해 해에 바짝 붙인다
  arrow: {
    marginBottom: -4,
  },
  // 반원 해 + 방사형 광선 — 광선 위치·각도는 해의 원 중심(컨테이너 하단 중앙)
  // 기준 반지름 12, 방사각 20°·65° 대칭 배치
  sunRow: {
    width: 34,
    height: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sun: {
    width: 16,
    height: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  ray: {
    position: 'absolute',
    width: 5,
    height: 2,
    borderRadius: 1,
  },
  rayL1: {
    left: 3,
    bottom: 3,
    transform: [{ rotate: '20deg' }],
  },
  rayL2: {
    left: 9,
    bottom: 10,
    transform: [{ rotate: '65deg' }],
  },
  rayR2: {
    right: 9,
    bottom: 10,
    transform: [{ rotate: '-65deg' }],
  },
  rayR1: {
    right: 3,
    bottom: 3,
    transform: [{ rotate: '-20deg' }],
  },
  horizon: {
    width: 24,
    height: 2,
    borderRadius: 1,
  },
});

// 라이딩 날씨 상세 바텀시트 — 적합도 등급·점수, 현재 조건, 6시간 예보
export default function WeatherSheet({ weather, latitude, longitude, onClose }: Props) {
  const { data: region } = useQuery({
    queryKey: ['weather-region', latitude?.toFixed(2), longitude?.toFixed(2)],
    queryFn: () => coordToRegion(latitude!, longitude!),
    enabled: latitude != null && longitude != null,
    staleTime: 30 * 60 * 1000,
  });

  // 기상특보 — 전국 발효 특보(10분 캐시)를 받아 이 지역 것만 추린다.
  // 폭염·호우·강풍은 라이딩 가부에 직결되는데 단기예보에는 안 실린다.
  const { data: allWarnings = [] } = useQuery({
    queryKey: ['weather-warnings'],
    queryFn: fetchWeatherWarnings,
    staleTime: 10 * 60 * 1000,
  });
  const { data: regionParts } = useQuery({
    queryKey: ['weather-region-parts', latitude?.toFixed(2), longitude?.toFixed(2)],
    queryFn: () => coordToRegionParts(latitude!, longitude!),
    enabled: latitude != null && longitude != null,
    staleTime: 30 * 60 * 1000,
  });
  const warnings = warningsForRegion(allWarnings, regionParts ?? null)
    // 경보를 앞으로 — 자리가 좁아 대표 하나만 보여주고 나머지는 +N
    .sort((a, b) => Number(b.level === '경보') - Number(a.level === '경보'));
  const topWarning = warnings[0];

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
              {/* 발효 중인 특보 — 점수 줄 우측 끝. 조회가 늦어도 이 줄 높이는
                  이미 있어서 나타날 때 레이아웃 시프트가 없다 */}
              {topWarning && (
                <View
                  style={[
                    styles.warningChip,
                    {
                      backgroundColor:
                        (topWarning.level === '경보' ? semantic.danger : semantic.warning) + '1A',
                    },
                  ]}>
                  <Feather
                    name="alert-triangle"
                    size={12}
                    color={topWarning.level === '경보' ? semantic.danger : semantic.warning}
                  />
                  <Text
                    style={[
                      styles.warningText,
                      { color: topWarning.level === '경보' ? semantic.danger : semantic.warning },
                    ]}>
                    {topWarning.type}
                    {topWarning.level}
                    {warnings.length > 1 ? ` +${warnings.length - 1}` : ''}
                  </Text>
                </View>
              )}
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
              <View style={styles.statValueRow}>
                <Text style={[styles.statValue, { color: s.color ?? colors.text }]}>{s.value}</Text>
                {!!s.sub && (
                  <Text style={[styles.statSub, { color: colors.textSecondary }]}>{s.sub}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* 12시간 예보 — 가로 스와이프. 시트 패딩을 상쇄해 끝까지 흘린다 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.hourlyScroll}
          contentContainerStyle={styles.hourlyScrollContent}>
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
                    <SunGlyph
                      type={item.e.type}
                      lineColor={colors.textSecondary}
                      arrowColor={colors.text}
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
  // absolute — 행 레이아웃에 참여하지 않아 늦게 나타나도 행 높이가 변할 수 없다
  warningChip: {
    position: 'absolute',
    right: 0,
    top: '50%',
    height: 20,
    transform: [{ translateY: -10 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '700',
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
    lineHeight: 20,
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
    gap: 5,
  },
  statLabel: {
    fontSize: 11,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    // 미세먼지 값이 늦게 도착해 단위 텍스트가 끼어도 행 높이가 흔들리지
    // 않도록 고정 — 로드 전후 셀 높이가 같아야 아래 예보가 안 밀린다
    minHeight: 20,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  statSub: {
    fontSize: 11,
  },
  hourlyScroll: {
    marginHorizontal: -20,
  },
  hourlyScrollContent: {
    paddingHorizontal: 20,
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

import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatWeek, type Hours } from '@/lib/hours';
import OpenBadge, { STATUS_LABELS } from '@/components/place/OpenBadge';

interface Props {
  loading: boolean;
  hours?: Hours | null;
  businessStatus?: string | null;
}

/**
 * 우리 DB 에 없는 장소(주유소·지도 POI)의 영업시간 블록.
 *
 * 구글 응답을 기다렸다 그리면 카드가 눈앞에서 벌어지므로, 기다리는 동안은
 * 자리를 잡아 둔다. 다만 알아낸 게 없으면 블록째 접는다 — 구글에 없는 장소가
 * 흔해서, 자리를 계속 지키면 대부분의 카드에 빈칸이 남는다.
 */
export default function PlaceHoursBlock({ loading, hours, businessStatus }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (loading) {
    return (
      <View style={styles.block}>
        <View style={[styles.skeleton, { width: 96, backgroundColor: colors.surfaceMuted }]} />
        <View style={[styles.skeleton, { width: 150, backgroundColor: colors.surfaceMuted }]} />
      </View>
    );
  }

  const lines = hours ? formatWeek(hours) : [];
  // 영업중이라는 사실만으론 보여줄 게 없다 — 휴업·폐업은 그 자체가 정보다
  const notable = !!businessStatus && businessStatus in STATUS_LABELS;
  if (lines.length === 0 && !notable) return null;

  return (
    <View style={styles.block}>
      <OpenBadge hours={hours} businessStatus={businessStatus} note={hours?.note} />
      {lines.map((line) => (
        <Text key={line} style={[styles.line, { color: colors.textSecondary }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 10,
    // 배지 한 줄 + 영업시간 두 줄. 요일마다 다른 곳은 더 늘어나지만 드물다
    minHeight: 60,
  },
  line: {
    fontSize: 13,
    lineHeight: 18,
  },
  skeleton: {
    height: 14,
    borderRadius: 7,
    marginBottom: 8,
  },
});

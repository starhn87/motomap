import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatWeek, type Hours } from '@/lib/hours';
import OpenBadge, { STATUS_LABELS } from '@/components/place/OpenBadge';

interface Props {
  hours?: Hours | null;
  businessStatus?: string | null;
}

/**
 * 우리 DB 에 없는 장소(주유소·지도 POI)의 영업시간 블록.
 *
 * 기다리는 동안 자리를 잡거나 스켈레톤을 깔지 않는다. 구글에 영업시간이 없는
 * 장소가 오히려 흔해서, 결국 사라질 자리를 매번 깜빡이는 게 노이즈가 된다.
 */
export default function PlaceHoursBlock({ hours, businessStatus }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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
  },
  line: {
    fontSize: 13,
    lineHeight: 18,
  },
});

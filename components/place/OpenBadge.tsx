import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { describeOpenState, getOpenState, type Hours } from '@/lib/hours';
import type { PlaceOperationalStatus } from '@/types';

interface Props {
  hours?: Hours | null;
  /** 구글 businessStatus — 임시 휴업·폐업은 시간표보다 우선한다 */
  businessStatus?: string | null;
  /** 모토맵 운영자가 확인한 상태 — 외부 공급자 상태보다 우선한다 */
  operationalStatus?: PlaceOperationalStatus;
  /** 시간표로 못 담는 것: "우천 휴무" 등 */
  note?: string;
  /** 다른 콘텐츠와 같은 행에 놓을 때 바깥 여백을 제거하고 한 줄로 줄인다 */
  inline?: boolean;
}

// 구글이 주는 값. OPERATIONAL 은 평범한 영업 상태라 따로 표시할 게 없다.
export const STATUS_LABELS: Record<string, string> = {
  CLOSED_TEMPORARILY: '임시 휴업',
  CLOSED_PERMANENTLY: '폐업',
};

const OPERATIONAL_STATUS_LABELS: Partial<Record<PlaceOperationalStatus, string>> = {
  temporarily_closed: '임시 휴업',
  permanently_closed: '폐업',
  moved: '이전',
};

/**
 * "지금 갈 수 있나"를 한 줄로. 근거가 없으면 아무것도 그리지 않는다 —
 * 틀린 영업중은 라이더를 헛걸음시킨다.
 */
export default function OpenBadge({
  hours,
  businessStatus,
  operationalStatus,
  note,
  inline = false,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const statusLabel =
    (operationalStatus ? OPERATIONAL_STATUS_LABELS[operationalStatus] : undefined) ??
    (businessStatus ? STATUS_LABELS[businessStatus] : undefined);
  const state = describeOpenState(getOpenState(hours));
  if (!statusLabel && !state) return null;

  const open = !statusLabel && !!state?.open;
  const text = statusLabel ?? state!.text;

  return (
    <View style={[styles.row, inline && styles.inlineRow]}>
      <View style={[styles.dot, { backgroundColor: open ? '#22C55E' : '#EF4444' }]} />
      <Text
        style={[
          styles.text,
          inline && styles.inlineText,
          { color: open ? '#22C55E' : colors.textSecondary },
        ]}
        numberOfLines={inline ? 1 : undefined}>
        {text}
      </Text>
      {!!note && (
        <Text style={[styles.note, { color: colors.textSecondary }]} numberOfLines={1}>
          · {note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // 배지가 없으면 컴포넌트째 안 그려지므로, 아래 여백은 여기 들고 있는 게 맞다
    marginBottom: 6,
  },
  inlineRow: {
    width: '100%',
    justifyContent: 'flex-end',
    marginBottom: 0,
  },
  inlineText: {
    flexShrink: 1,
    textAlign: 'right',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  note: {
    flex: 1,
    fontSize: 13,
  },
});

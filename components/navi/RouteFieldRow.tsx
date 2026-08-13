import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 경로 편집 카드의 행 높이 — 드래그 타깃 계산이 이 값의 균일 격자에 기댄다
// (+ 버튼은 divider 위에 떠 있어 세로 공간을 차지하지 않는다)
export const ROW_H = 44;

// 드래그 중인 행의 현재 y 에 가장 가까운 슬롯 — 드롭 타깃이자,
// 다른 행들이 실시간으로 비켜줄 기준이다.
export function nearestSlot(curY: number, rowCount: number) {
  'worklet';
  return Math.max(0, Math.min(rowCount - 1, Math.round(curY / ROW_H)));
}

export default function RouteFieldRow({
  icon,
  value,
  placeholder,
  onPress,
  onRemove,
  onAdd,
  index,
  rowCountSv,
  dragIndex,
  dragY,
  pan,
  dragDisabled,
}: {
  icon: 'radiobox-marked' | 'circle-medium' | 'map-marker';
  value: string;
  placeholder?: string;
  onPress: () => void;
  onRemove?: () => void;
  /** 도착지 행 오른쪽 끝의 경유지 추가 버튼 (경유지가 있을 때) */
  onAdd?: () => void;
  /** 빈 경유지 줄 — 드래그가 꺼져 있음을 핸들 흐림으로 알린다 */
  dragDisabled?: boolean;
  /** 재정렬 목록에서의 논리 인덱스 (출발 0 … 도착 마지막) */
  index: number;
  rowCountSv: SharedValue<number>;
  dragIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  pan: ReturnType<typeof Gesture.Pan>;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  // 드래그 중인 행은 손가락을 따라 떠오르고, 나머지 행은 드래그 행이
  // 지날 슬롯을 실시간으로 비켜준다(네이버 지도식). 놓으면 그 순서로 재배열.
  const animatedStyle = useAnimatedStyle(() => {
    const from = dragIndex.value;
    if (from === index) {
      return {
        transform: [{ translateY: dragY.value }, { scale: 1.03 }],
        zIndex: 10,
        opacity: 0.95,
      };
    }
    if (from < 0) {
      // 드래그 종료 상태는 애니메이션 없이 즉시 제자리 — 재배열 커밋과 같은
      // 프레임에 확정돼야 드롭 후 잔여 슬라이드가 안 생긴다
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        zIndex: 0,
        opacity: 1,
      };
    }
    const target = nearestSlot(from * ROW_H + dragY.value, rowCountSv.value);
    let shift = 0;
    if (from < index && index <= target) shift = -ROW_H; // 드래그 행이 내려와 내 자리를 차지
    else if (target <= index && index < from) shift = ROW_H; // 드래그 행이 올라와 내 자리를 차지
    return {
      transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }],
      zIndex: 0,
      opacity: 1,
    };
  });
  return (
    <Animated.View style={animatedStyle}>
      <View style={styles.routeFieldRow}>
        <GestureDetector gesture={pan}>
          <View style={styles.routeFieldHandle} collapsable={false}>
            <MaterialCommunityIcons
              name="unfold-more-horizontal"
              size={16}
              color={colors.textSecondary}
              style={dragDisabled ? styles.routeHandleDisabled : undefined}
            />
          </View>
        </GestureDetector>
        <Pressable onPress={onPress} style={styles.routeFieldMain}>
          <MaterialCommunityIcons name={icon} size={15} color={colors.textSecondary} />
          <Text
            style={[
              styles.routeFieldValue,
              { color: value ? colors.text : colors.textSecondary },
            ]}
            numberOfLines={1}>
            {value || placeholder}
          </Text>
        </Pressable>
        {onRemove && (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            style={[styles.routeCircleButton, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="minus" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
        {onAdd && (
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            style={[styles.routeCircleButton, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="plus" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  routeFieldRow: {
    // 높이 고정 — 드래그 재정렬의 슬롯 계산(ROW_H)이 이 값에 기댄다
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeFieldMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  routeFieldValue: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '500',
  },
  routeFieldHandle: {
    paddingRight: 8,
    paddingLeft: 2,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  routeHandleDisabled: {
    opacity: 0.3,
  },
  // 행 오른쪽 끝의 ⊖·⊕ — 같은 테두리 원형으로 시각 언어를 맞춘다
  routeCircleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
});

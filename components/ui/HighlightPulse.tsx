import { useEffect } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

interface Props {
  /** 값이 바뀔 때마다 다시 반짝인다. 없으면 아무 효과 없는 일반 컨테이너 */
  pulseKey?: string;
  /** 반짝임 시작 지연(ms) — 스크롤·시트 확장이 끝난 뒤 시작하도록 호출부가 정한다 */
  delay?: number;
  /** 강조 테두리 색 */
  tint: string;
  /** 감싸는 카드의 borderRadius 와 맞춘다 */
  borderRadius: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}

// 카드 위에 절대배치 테두리 오버레이를 얹어 한 번 반짝인다.
// 카드 자체의 border 를 건드리지 않으므로 내부 콘텐츠 레이아웃이 밀리지 않는다.
export default function HighlightPulse({
  pulseKey,
  delay = 0,
  tint,
  borderRadius,
  style,
  onLayout,
  children,
}: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!pulseKey) return;
    const t = setTimeout(() => {
      progress.value = withSequence(
        withTiming(1, { duration: 320 }),
        withTiming(0, { duration: 420 }),
      );
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View style={style} onLayout={onLayout}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: 2, borderColor: tint, borderRadius },
          overlayStyle,
        ]}
      />
    </View>
  );
}

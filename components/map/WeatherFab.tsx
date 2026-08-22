import { Pressable, Text, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { RidingWeather } from '@/lib/api/weather';

interface Props {
  weather: RidingWeather;
  open: boolean;
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// 지도 좌측(카테고리 필터 아래)의 라이딩 날씨 플로팅 버튼 — 상태·기온 요약,
// 테두리 색이 라이딩 적합도 등급을 나타낸다. 탭하면 상세 바텀시트.
export default function WeatherFab({ weather, open, onPress }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityLabel={`라이딩 날씨 ${weather.current.temp}도, 상세 ${open ? '닫기' : '보기'}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.82, { duration: 90 });
      }}
      onPressOut={() => {
        cancelAnimation(scale);
        scale.value = 1;
      }}
      style={[
        styles.fab,
        animatedStyle,
        {
          backgroundColor: colors.background,
          borderColor: weather.gradeColor,
        },
      ]}>
      <Text style={styles.emoji}>{weather.current.emoji}</Text>
      <Text style={[styles.temp, { color: colors.text }]}>{weather.current.temp}°</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 158,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 5,
  },
  emoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  temp: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

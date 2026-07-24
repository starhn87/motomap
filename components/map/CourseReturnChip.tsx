import { Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 코스 상세의 근처 장소에서 지도로 넘어왔을 때 뜨는 복귀 칩 —
// 표시 조건(그 장소의 시트가 열려 있는 동안)은 부모(지도 화면)가 판단한다.
export default function CourseReturnChip({ onPress }: { onPress: () => void }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <Ionicons name="chevron-back" size={16} color={colors.text} />
        <Text style={[styles.text, { color: colors.text }]}>코스로 돌아가기</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 162,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
    elevation: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 17,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});

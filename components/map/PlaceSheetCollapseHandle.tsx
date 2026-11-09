import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export default function PlaceSheetCollapseHandle({ color, onCollapse }: { color: string; onCollapse: () => void }) {
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-16, 16])
    .onEnd(({ translationY, velocityY }) => {
      if (translationY >= 24 || velocityY >= 400) runOnJS(onCollapse)();
    });

  return <GestureDetector gesture={pan}>
    <Pressable accessibilityRole="button" accessibilityLabel="장소 상세 접기" onPress={onCollapse} style={styles.target}>
      <View style={[styles.indicator, { backgroundColor: color }]} />
    </Pressable>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  target: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  indicator: { width: 36, height: 4, borderRadius: 2 },
});

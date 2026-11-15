import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

function PlaceSheetCollapseHandle({ onCollapse }: { onCollapse: () => void }) {
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-16, 16])
    .onEnd(({ translationY, velocityY }) => {
      if (translationY >= 24 || velocityY >= 400) runOnJS(onCollapse)();
    });

  return <GestureDetector gesture={pan}>
    <Pressable accessibilityRole="button" accessibilityLabel="장소 상세 접기" onPress={onCollapse} style={styles.target} />
  </GestureDetector>;
}

export default memo(PlaceSheetCollapseHandle);

const styles = StyleSheet.create({
  target: { flex: 1, height: 44 },
});

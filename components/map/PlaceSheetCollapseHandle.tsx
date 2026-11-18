import { memo, useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useBottomSheetGestureHandlers } from '@gorhom/bottom-sheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { placeSheetOffsetY, placeSheetHeaderOffsetX } from './placeSheetPanOffsets';

function PlaceSheetCollapseHandle({ onCollapse }: { onCollapse: () => void }) {
  const { handlePanGestureHandler } = useBottomSheetGestureHandlers();
  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY(placeSheetOffsetY)
    .failOffsetX(placeSheetHeaderOffsetX)
    .shouldCancelWhenOutside(false)
    .runOnJS(false)
    .onStart(handlePanGestureHandler.handleOnStart)
    .onChange(handlePanGestureHandler.handleOnChange)
    .onEnd(handlePanGestureHandler.handleOnEnd)
    .onFinalize(handlePanGestureHandler.handleOnFinalize), [handlePanGestureHandler]);

  return <GestureDetector gesture={pan}>
    <Pressable accessibilityRole="button" accessibilityLabel="장소 상세 접기" onPress={onCollapse} style={styles.target} />
  </GestureDetector>;
}

export default memo(PlaceSheetCollapseHandle);

const styles = StyleSheet.create({
  target: { flex: 1, height: 44 },
});

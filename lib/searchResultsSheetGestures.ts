import { useCallback } from 'react';
import {
  ANIMATION_SOURCE,
  GESTURE_SOURCE,
  useBottomSheetInternal,
  useGestureEventsHandlersDefault,
  type GestureEventHandlerCallbackType,
} from '@gorhom/bottom-sheet';
import { useSharedValue } from 'react-native-reanimated';

export const SEARCH_RESULTS_MIDDLE_SNAP_INDEX = 1;
const MIN_UPWARD_SWIPE = 48;

export function useIOSSearchResultsSheetGestures() {
  const handlers = useGestureEventsHandlersDefault();
  const { handleOnStart, handleOnEnd } = handlers;
  const { animatedIndex, animatedDetentsState, isInTemporaryPosition, animateToPosition } = useBottomSheetInternal();
  const startedAtMiddle = useSharedValue(false);

  const start: GestureEventHandlerCallbackType = useCallback((source, event) => {
    'worklet';
    startedAtMiddle.value = animatedIndex.value === SEARCH_RESULTS_MIDDLE_SNAP_INDEX;
    handleOnStart(source, event);
  }, [animatedIndex, handleOnStart, startedAtMiddle]);

  const end: GestureEventHandlerCallbackType = useCallback((source, event) => {
    'worklet';
    const { translationX, translationY, velocityY } = event;
    if (source === GESTURE_SOURCE.CONTENT && startedAtMiddle.value && !isInTemporaryPosition.value
      && translationY <= -MIN_UPWARD_SWIPE && -translationY > Math.abs(translationX) && velocityY <= 0) {
      const { highestDetentPosition } = animatedDetentsState.get();
      if (highestDetentPosition !== undefined) {
        animateToPosition(highestDetentPosition, ANIMATION_SOURCE.GESTURE, velocityY / 2);
        return;
      }
    }
    handleOnEnd(source, event);
  }, [animateToPosition, animatedDetentsState, handleOnEnd, isInTemporaryPosition, startedAtMiddle]);

  return { ...handlers, handleOnStart: start, handleOnEnd: end };
}

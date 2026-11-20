import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, TextInput, type KeyboardMetrics, type ScrollView, type View } from 'react-native';

type ScrollResponder = Pick<ScrollView, 'scrollTo' | 'getNativeScrollRef'> & {
  getInnerViewRef(): View | null;
};
type KeyboardScrollView = { getScrollResponder(): unknown };

// iOS에서는 키보드 전환이 시작될 때 입력란과 목표 키보드 위치를 비교한다.
export function useRevealKeyboardInput(
  scrollRef: RefObject<KeyboardScrollView | null>,
  { padOccludedContent = false }: { padOccludedContent?: boolean } = {},
) {
  const [extraScrollInset, setExtraScrollInset] = useState(0);
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const keyboardFrame = useRef<KeyboardMetrics | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const measurementEpoch = useRef(0);
  const keyboardHiding = useRef(false);

  const reveal = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (keyboardHiding.current) return;
      const input = focused.current;
      const keyboard = keyboardFrame.current ?? Keyboard.metrics();
      const scroll = scrollRef.current?.getScrollResponder() as ScrollResponder | null | undefined;
      const viewport = scroll?.getNativeScrollRef?.();
      const content = scroll?.getInnerViewRef?.();
      if (!input || !keyboard || !viewport || !content || !scroll || TextInput.State.currentlyFocusedInput() !== input) return;

      const epoch = measurementEpoch.current;
      const isCurrent = () => measurementEpoch.current === epoch
        && focused.current === input && TextInput.State.currentlyFocusedInput() === input
        && !keyboardHiding.current;
      viewport.measureInWindow((_x, viewportY, _width, height) => {
        if (!isCurrent()) return;
        // Android edge-to-edge에서는 키보드가 떠도 detached 시트의 뷰포트가 줄지 않는다.
        // 실제 가려진 만큼만 콘텐츠 끝에 공간을 만들어 입력란까지 스크롤할 수 있게 한다.
        if (padOccludedContent && Platform.OS === 'android') {
          setExtraScrollInset(Math.max(0, viewportY + height - keyboard.screenY));
        }
        content.measureInWindow((_cx, contentY) => {
          input.measureInWindow((_ix, y, _iw, inputHeight) => {
            if (!isCurrent() || !height || !inputHeight) return;
            const visibleBottom = Math.min(viewportY + height, keyboard.screenY) - 12;
            if (visibleBottom <= viewportY) return;
            const offset = viewportY - contentY;
            if (y + inputHeight > visibleBottom) {
              const shift = Math.min(y + inputHeight - visibleBottom, y - viewportY - 12);
              if (shift !== 0) scroll.scrollTo({ y: Math.max(0, offset + shift), animated: true });
            } else if (y < viewportY) {
              scroll.scrollTo({ y: Math.max(0, offset + y - viewportY - 12), animated: true });
            }
          });
        });
      });
    });
  }, [scrollRef, padOccludedContent]);

  useEffect(() => {
    const start = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', ({ endCoordinates }) => {
      if (endCoordinates.height <= 0 || endCoordinates.screenY >= Dimensions.get('screen').height) return;
      measurementEpoch.current += 1;
      keyboardHiding.current = false;
      keyboardFrame.current = endCoordinates;
      reveal();
    });
    const hideStart = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillHide', () => {
      measurementEpoch.current += 1;
      keyboardHiding.current = true;
      keyboardFrame.current = null;
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    }) : undefined;
    const stop = Keyboard.addListener('keyboardDidHide', () => {
      measurementEpoch.current += 1;
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      setExtraScrollInset(0);
      keyboardHiding.current = false;
      keyboardFrame.current = null;
    });
    return () => {
      measurementEpoch.current += 1;
      start.remove();
      hideStart?.remove();
      stop.remove();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [reveal]);

  return {
    extraScrollInset,
    onFocus() {
      focused.current = TextInput.State.currentlyFocusedInput();
      reveal();
    },
    reveal,
  };
}

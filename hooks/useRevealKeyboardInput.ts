import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Keyboard, Platform, TextInput, type KeyboardMetrics, type ScrollView, type View } from 'react-native';

type ScrollResponder = Pick<ScrollView, 'scrollTo' | 'getNativeScrollRef'> & {
  getInnerViewRef(): View | null;
};
type KeyboardScrollView = { getScrollResponder(): unknown };

// 시트와 iOS 인셋 애니메이션이 끝난 실제 위치에서 가려진 만큼만 스크롤한다.
export function useRevealKeyboardInput(scrollRef: RefObject<KeyboardScrollView | null>) {
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const keyboardFrame = useRef<KeyboardMetrics | null>(null);
  const frame = useRef<number | undefined>(undefined);

  const reveal = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const input = focused.current;
      const keyboard = keyboardFrame.current ?? Keyboard.metrics();
      const scroll = scrollRef.current?.getScrollResponder() as ScrollResponder | null | undefined;
      const viewport = scroll?.getNativeScrollRef?.();
      const content = scroll?.getInnerViewRef?.();
      if (!input || !keyboard || !viewport || !content || !scroll || TextInput.State.currentlyFocusedInput() !== input) return;

      viewport.measureInWindow((_x, viewportY, _width, height) => {
        content.measureInWindow((_cx, contentY) => {
          input.measureInWindow((_ix, y, _iw, inputHeight) => {
            if (TextInput.State.currentlyFocusedInput() !== input || focused.current !== input || !Keyboard.isVisible() || !height || !inputHeight) return;
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
  }, [scrollRef]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', ({ endCoordinates }) => {
      keyboardFrame.current = endCoordinates;
      reveal();
    });
    const change = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardDidChangeFrame', ({ endCoordinates }) => {
          keyboardFrame.current = endCoordinates;
          reveal();
        })
      : undefined;
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardFrame.current = null; });
    return () => {
      show.remove();
      change?.remove();
      hide.remove();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [reveal]);

  return {
    onFocus() {
      focused.current = TextInput.State.currentlyFocusedInput();
      reveal();
    },
    reveal,
  };
}

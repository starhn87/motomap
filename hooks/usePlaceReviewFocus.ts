import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent } from 'react-native';

type ScrollTarget = { scrollTo: (options: { y: number; animated: boolean }) => void };

export function usePlaceReviewFocus(
  requestKey: string | undefined,
  expanded: boolean,
  headerHeight: number,
  scrollRef: RefObject<ScrollTarget | null>,
) {
  const [layout, setLayout] = useState<{ key: string; y: number }>();
  const handled = useRef<string>(undefined);

  useEffect(() => {
    if (!requestKey || !expanded || layout?.key !== requestKey || handled.current === requestKey) return;
    const frame = requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      handled.current = requestKey;
      scrollRef.current.scrollTo({ y: Math.max(0, layout.y - headerHeight - 8), animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, headerHeight, layout, requestKey, scrollRef]);

  return (event: LayoutChangeEvent) => {
    if (!requestKey) return;
    const y = event.nativeEvent.layout.y;
    setLayout(current => current?.key === requestKey && current.y === y ? current : { key: requestKey, y });
  };
}

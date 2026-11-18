import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const HeaderScrollContext = createContext<{ scrolled: boolean; setScrolled: (value: boolean) => void } | null>(null);

export function HeaderScrollProvider({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  return <HeaderScrollContext.Provider value={{ scrolled, setScrolled }}>{children}</HeaderScrollContext.Provider>;
}

export function useHeaderScrolled() { return useContext(HeaderScrollContext)?.scrolled ?? false; }

// 숨긴 목록의 위치는 보존한다. 다시 선택되면 그 목록의 스크롤 상태를 헤더에 복원한다.
export function useTrackHeaderScroll(active = true, { resetKey, hasContent = true }: { resetKey?: string; hasContent?: boolean } = {}) {
  const setScrolled = useContext(HeaderScrollContext)?.setScrolled;
  const last = useRef({ scrolled: false, resetKey });
  useEffect(() => {
    if (last.current.resetKey !== resetKey || !hasContent) last.current = { scrolled: false, resetKey };
    if (active) setScrolled?.(last.current.scrolled);
  }, [active, setScrolled, resetKey, hasContent]);
  return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y > 4;
    if (!hasContent || next === last.current.scrolled) return;
    last.current.scrolled = next;
    if (active) setScrolled?.(next);
  };
}

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { UserLocationMarker } from '@/components/map/UserLocationMarker';
import { useUserLocation } from '@/hooks/useUserLocation';
import { markerHeadingMotion, markerPositionMotion } from '@/lib/userLocationTracking';
import { useMapStore } from '@/stores/useMapStore';

function useMarkerTransition<T>(
  target: T | null,
  enabled: boolean,
  duration: number,
  interpolate: (from: T, to: T) => ((progress: number) => T) | null,
) {
  const [displayed, setDisplayed] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    const motion = enabled && from !== null && target !== null ? interpolate(from, target) : null;
    if (!motion) {
      current.current = target;
      setDisplayed(target);
      return;
    }
    let frame: number;
    const started = performance.now();
    const draw = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const next = progress === 1 ? target : motion(1 - (1 - progress) ** 2);
      current.current = next;
      setDisplayed(next);
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, duration, interpolate]);

  return enabled ? displayed ?? target : target;
}

/**
 * 위치·방향 센서 갱신을 지도 전체 렌더 트리에서 격리한다.
 * 방향은 짧은 간격으로 바뀌지만 정적 장소 마커를 다시 계산할 이유는 없다.
 */
export function TrackedUserLocationMarker({ enabled, retry, isHome }: { enabled: boolean; retry: number; isHome: boolean }) {
  const userLocation = useMapStore((state) => state.userLocation);
  const { heading, tracking } = useUserLocation(enabled, true, retry);
  const reduceMotion = useReducedMotion();
  const animate = Platform.OS === 'android' && isHome && tracking && !reduceMotion;
  const position = useMarkerTransition(userLocation, animate, 320, markerPositionMotion);
  const direction = useMarkerTransition(heading, animate, 240, markerHeadingMotion);

  if (!userLocation || !position) return null;

  return (
    <UserLocationMarker
      latitude={position.latitude}
      longitude={position.longitude}
      heading={direction ?? heading}
    />
  );
}

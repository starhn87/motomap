import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

// 네이버 지도처럼 링이 아니라 채워진 글로우가 퍼지며 사라진다
const USER_LOCATION_PULSE = 'rgba(45, 140, 255, 0.35)';
// UserLocationMarker 의 halo 와 동일 스펙 — 펄스가 끝나면 이 원이 페이드 인으로
// 나타난 뒤 마커 내 정적 halo 로 자리를 넘긴다
const USER_LOCATION_HALO = 'rgba(45, 140, 255, 0.18)';
const PULSE_SIZE = 40;
const PULSE_COUNT = 3;
const PULSE_DURATION = 1600;
const PULSE_STAGGER = 1300;
const HALO_FADE_DURATION = 400;

// 한 개의 퍼지는 링. delay만큼 늦게 시작한다.
function PulseRing({
  x,
  y,
  delay,
  onDone,
}: {
  x: number;
  y: number;
  delay: number;
  onDone?: () => void;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: PULSE_DURATION, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    // 점 외경(지름 18) 바로 바깥에서 시작해 마커 halo 크기(지름 40)까지만
    // 퍼진다 — 초반에 빠르게 번지고 감속하며 잦아드는 글로우
    transform: [{ scale: 0.45 + progress.value * 0.55 }],
    opacity: progress.value === 0 ? 0 : 1 - progress.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.userLocationPulse,
        { left: x - PULSE_SIZE / 2, top: y - PULSE_SIZE / 2 },
        animatedStyle,
      ]}
    />
  );
}

// 펄스가 끝난 자리에 마커 halo 와 같은 원을 서서히 띄운다 — 완료되면 부모가
// 마커의 정적 halo 를 복귀시키므로 교체 순간이 이어져 보인다.
function HaloFadeIn({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: HALO_FADE_DURATION }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.haloFade,
        { left: x - PULSE_SIZE / 2, top: y - PULSE_SIZE / 2 },
        animatedStyle,
      ]}
    />
  );
}

/**
 * 내 위치 탭 시 PULSE_COUNT개의 글로우가 순차로 퍼진 뒤 halo 가 서서히 돌아온다.
 * 마커는 정적 비트맵으로 캡처되므로 마커 밖(지도 위 화면 좌표)에서 RN 뷰로
 * 애니메이션한다. 재생 동안 부모는 마커의 정적 halo 를 숨겨야 한다.
 */
export function LocationPulse({
  x,
  y,
  onDone,
}: {
  x: number;
  y: number;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'rings' | 'halo'>('rings');

  return (
    <>
      {Array.from({ length: PULSE_COUNT }, (_, i) => (
        <PulseRing
          key={i}
          x={x}
          y={y}
          delay={i * PULSE_STAGGER}
          onDone={i === PULSE_COUNT - 1 ? () => setPhase('halo') : undefined}
        />
      ))}
      {phase === 'halo' && <HaloFadeIn x={x} y={y} onDone={onDone} />}
    </>
  );
}

const styles = StyleSheet.create({
  userLocationPulse: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    backgroundColor: USER_LOCATION_PULSE,
  },
  haloFade: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    backgroundColor: USER_LOCATION_HALO,
  },
});

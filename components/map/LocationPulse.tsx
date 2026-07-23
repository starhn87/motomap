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

// 네이버 지도 실측(확대 편집 영상 프레임 분석) 기반 안무: 채워진 소프트 글로우가
// 마커 점 언저리(지름 ~27dp)에서 태어나 지름 ~60dp까지 퍼지면서 점점 흐려져
// 소멸하고, 짧은 휴지 뒤 다시 태어난다(주기 ~2초).
const GLOW_BLUE = 'rgb(45, 140, 255)';
const GLOW_SIZE = 60;
const START_SCALE = 0.45;
const START_ALPHA = 0.5;
const WAVE_DURATION = 1600; // 확산+소멸
const WAVE_INTERVAL = 2000; // 다음 파동까지 (휴지 400ms)
const WAVE_COUNT = 3;
// UserLocationMarker 의 halo 와 동일 스펙 — 파동이 모두 끝나면 이 원이 서서히
// 나타난 뒤 마커 내 정적 halo 로 자리를 넘긴다
const USER_LOCATION_HALO = 'rgba(45, 140, 255, 0.18)';
const HALO_SIZE = 40;
const HALO_FADE_DURATION = 400;

// 한 번의 파동: 퍼지면서 흐려져 소멸한다. delay 만큼 늦게 태어난다.
function PulseWave({
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
      withTiming(1, { duration: WAVE_DURATION, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: START_SCALE + progress.value * (1 - START_SCALE) }],
    opacity: progress.value === 0 ? 0 : START_ALPHA * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        { left: x - GLOW_SIZE / 2, top: y - GLOW_SIZE / 2 },
        animatedStyle,
      ]}
    />
  );
}

// 파동이 끝난 자리에 마커 halo 와 같은 원을 서서히 띄운다 — 완료되면 부모가
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
        { left: x - HALO_SIZE / 2, top: y - HALO_SIZE / 2 },
        animatedStyle,
      ]}
    />
  );
}

/**
 * 내 위치 탭 시 WAVE_COUNT번의 글로우 파동이 퍼진 뒤 halo 가 서서히 돌아온다.
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
  const [phase, setPhase] = useState<'waves' | 'halo'>('waves');

  return (
    <>
      {Array.from({ length: WAVE_COUNT }, (_, i) => (
        <PulseWave
          key={i}
          x={x}
          y={y}
          delay={i * WAVE_INTERVAL}
          onDone={i === WAVE_COUNT - 1 ? () => setPhase('halo') : undefined}
        />
      ))}
      {phase === 'halo' && <HaloFadeIn x={x} y={y} onDone={onDone} />}
    </>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: GLOW_BLUE,
  },
  haloFade: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: USER_LOCATION_HALO,
  },
});

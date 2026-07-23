import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

// 네이버 지도 실측(영상 30fps 프레임 분석) 기반 안무:
// 확산 파동이 아니라 지름 ~68dp 글로우가 제자리에서 숨쉬듯 밝아졌다 돌아온다.
// 등장 시 살짝 큰 상태(~80dp)에서 수축하며 나타나고, 종료 시 마커의 정적
// halo(지름 40, 알파 0.18)와 같은 모습으로 수축·정착해 자리를 넘긴다.
const GLOW_BLUE = 'rgb(45, 140, 255)';
const GLOW_SIZE = 68;
const APPEAR_MS = 200;
const BREATH_UP_MS = 280; // 밝아짐
const BREATH_DOWN_MS = 280; // 되돌아옴
const BREATH_REST_MS = 440; // 휴지 — 실측상 숨 사이 간격이 있다
const BREATH_COUNT = 3;
const SETTLE_MS = 300;
const BASE_ALPHA = 0.3;
const PEAK_ALPHA = 0.375; // 실측 +25%
const HALO_ALPHA = 0.18; // UserLocationMarker 의 halo 와 동일
const HALO_SCALE = 40 / GLOW_SIZE; // 정착 시 마커 halo 크기로

/**
 * 내 위치 탭 시 마커 자리에서 글로우가 숨쉬는 효과. 마커는 정적 비트맵으로
 * 캡처되므로 마커 밖(지도 위 화면 좌표)에서 RN 뷰로 애니메이션한다.
 * 재생 동안 부모는 마커의 정적 halo 를 숨기고, 완료(onDone) 시 복귀시킨다 —
 * 마지막 프레임이 정적 halo 와 동일한 모습이라 교체가 이어져 보인다.
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
  const scale = useSharedValue(80 / GLOW_SIZE);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const breaths = Array.from({ length: BREATH_COUNT }, () => [
      withTiming(PEAK_ALPHA, { duration: BREATH_UP_MS, easing: Easing.inOut(Easing.quad) }),
      withTiming(BASE_ALPHA, { duration: BREATH_DOWN_MS, easing: Easing.inOut(Easing.quad) }),
      withTiming(BASE_ALPHA, { duration: BREATH_REST_MS }),
    ]).flat();

    opacity.value = withSequence(
      withTiming(BASE_ALPHA, { duration: APPEAR_MS }),
      ...breaths,
      withTiming(HALO_ALPHA, { duration: SETTLE_MS }, (finished) => {
        if (finished) runOnJS(onDone)();
      })
    );
    scale.value = withSequence(
      withTiming(1, { duration: APPEAR_MS, easing: Easing.out(Easing.quad) }),
      withDelay(
        BREATH_COUNT * (BREATH_UP_MS + BREATH_DOWN_MS + BREATH_REST_MS),
        withTiming(HALO_SCALE, { duration: SETTLE_MS, easing: Easing.inOut(Easing.quad) })
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
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

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: GLOW_BLUE,
  },
});

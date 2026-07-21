import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, useWindowDimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  photos: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  /** 현재 사진 하단에 띄울 부가 정보 (예: 해당 사진이 달린 리뷰) */
  renderFooter?: (index: number) => React.ReactNode;
}

// 전체화면 이미지 뷰어 — 좌우 스와이프로 넘기고, 아래로 스와이프·이미지 탭·✕ 로 닫는다.
// 페이징을 FlatList 에 맡기면 네이티브 스크롤과 dismiss 팬이 경합해 비결정적으로
// 지므로, 팬 제스처 하나가 첫 이동 방향을 보고 페이징(가로)과 닫기(세로)를 모두
// 처리한다. RN Modal 은 네이티브 루트에 뜨므로 바텀시트 안에서 열어도 최상위 표시.
export default function ImageViewer({
  photos,
  initialIndex = 0,
  visible,
  onClose,
  renderFooter,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  const translateX = useSharedValue(-initialIndex * width);
  const translateY = useSharedValue(0);
  // 'h' 페이징 / 'v' 닫기 — 첫 12px 이동의 지배 축으로 한 번만 결정
  const mode = useSharedValue<'idle' | 'h' | 'v'>('idle');

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      translateX.value = -initialIndex * width;
      translateY.value = 0;
      mode.value = 'idle';
    }
  }, [visible, initialIndex, width, translateX, translateY, mode]);

  const snapToPage = (page: number) => {
    'worklet';
    const clamped = Math.max(0, Math.min(photos.length - 1, page));
    translateX.value = withTiming(-clamped * width, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    runOnJS(setIndex)(clamped);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (mode.value === 'idle') {
        if (Math.abs(e.translationX) < 12 && Math.abs(e.translationY) < 12) return;
        mode.value = Math.abs(e.translationX) > Math.abs(e.translationY) ? 'h' : 'v';
      }
      if (mode.value === 'h') {
        const base = -index * width + e.translationX;
        // 양 끝에서는 고무줄 저항
        const min = -(photos.length - 1) * width;
        translateX.value = base > 0 ? base * 0.3 : base < min ? min + (base - min) * 0.3 : base;
      } else {
        // 위쪽은 저항만 주고 닫지 않는다
        translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.2;
      }
    })
    .onEnd((e) => {
      if (mode.value === 'h') {
        const moved = e.translationX + e.velocityX * 0.2;
        const delta = moved < -width * 0.35 ? 1 : moved > width * 0.35 ? -1 : 0;
        snapToPage(index + delta);
      } else if (mode.value === 'v') {
        if (e.translationY > 110 || e.velocityY > 900) {
          translateY.value = withTiming(height, { duration: 180 });
          runOnJS(onClose)();
        } else {
          translateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
        }
      }
      mode.value = 'idle';
    });

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, height * 0.4], [1, 0.3], 'clamp'),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.strip, { width: width * photos.length }, stripStyle]}>
            {photos.map((uri, i) => (
              <Pressable key={`${uri}-${i}`} style={{ width, height }} onPress={onClose}>
                <Image
                  source={{ uri }}
                  style={{ width, height }}
                  contentFit="contain"
                  transition={150}
                />
              </Pressable>
            ))}
          </Animated.View>
        </GestureDetector>

        {photos.length > 1 && (
          <View style={[styles.counter, { top: insets.top + 14 }]} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1} / {photos.length}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + 8 }]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {renderFooter && (
          <View
            style={[styles.footerWrap, { paddingBottom: insets.bottom + 16 }]}
            pointerEvents="box-none">
            {renderFooter(index)}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  strip: {
    flex: 1,
    flexDirection: 'row',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
});

import CloseIcon from '@/components/ui/CloseIcon';
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

// 전체화면 이미지 뷰어 — 좌우 스와이프로 넘기고, 핀치로 확대하며 아래로 스와이프·✕ 로 닫는다.
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
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const imageX = useSharedValue(0);
  const imageY = useSharedValue(0);
  const imageStartX = useSharedValue(0);
  const imageStartY = useSharedValue(0);
  // 'h' 페이징 / 'v' 닫기 / 'zoom' 확대 이미지 이동 — 첫 이동에서 한 번만 결정
  const mode = useSharedValue<'idle' | 'h' | 'v' | 'zoom'>('idle');

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      translateX.value = -initialIndex * width;
      translateY.value = 0;
      scale.value = 1;
      savedScale.value = 1;
      imageX.value = 0;
      imageY.value = 0;
      mode.value = 'idle';
    }
  }, [
    visible,
    initialIndex,
    width,
    translateX,
    translateY,
    scale,
    savedScale,
    imageX,
    imageY,
    mode,
  ]);

  const snapToPage = (page: number) => {
    'worklet';
    const clamped = Math.max(0, Math.min(photos.length - 1, page));
    translateX.value = withTiming(-clamped * width, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = 1;
    savedScale.value = 1;
    imageX.value = 0;
    imageY.value = 0;
    runOnJS(setIndex)(clamped);
  };

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => {
      imageStartX.value = imageX.value;
      imageStartY.value = imageY.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1.01) {
        mode.value = 'zoom';
        // 확대 중에는 한 손가락으로 사진을 살펴보고, 페이지 이동·닫기는 막는다.
        const maxX = (width * (scale.value - 1)) / 2;
        const maxY = (height * (scale.value - 1)) / 2;
        imageX.value = Math.max(-maxX, Math.min(maxX, imageStartX.value + e.translationX));
        imageY.value = Math.max(-maxY, Math.min(maxY, imageStartY.value + e.translationY));
        return;
      }
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

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      mode.value = 'zoom';
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(4, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1, { duration: 120 });
        savedScale.value = 1;
        imageX.value = withTiming(0, { duration: 120 });
        imageY.value = withTiming(0, { duration: 120 });
      } else {
        const maxX = (width * (scale.value - 1)) / 2;
        const maxY = (height * (scale.value - 1)) / 2;
        imageX.value = Math.max(-maxX, Math.min(maxX, imageX.value));
        imageY.value = Math.max(-maxY, Math.min(maxY, imageY.value));
      }
      mode.value = 'idle';
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, height * 0.4], [1, 0.3], 'clamp'),
  }));
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: imageX.value },
      { translateY: imageY.value },
      { scale: scale.value },
    ],
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
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.strip, { width: width * photos.length }, stripStyle]}>
            {photos.map((uri, photoIndex) => {
              // 제스처 계산용 페이지 폭은 전부 유지하되 원본 이미지는 현재 장과
              // 앞뒤 한 장만 마운트한다. 리뷰를 더 불러와도 메모리가 선형 증가하지 않는다.
              const shouldRender = Math.abs(photoIndex - index) <= 1;
              return (
                <View key={`${uri}-${photoIndex}`} style={[styles.page, { width, height }]}>
                  {shouldRender && (
                    <Animated.View style={[{ width, height }, imageStyle]}>
                      <Image
                        source={{ uri }}
                        style={{ width, height }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        recyclingKey={uri}
                        transition={150}
                      />
                    </Animated.View>
                  )}
                </View>
              );
            })}
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
          accessibilityRole="button"
          accessibilityLabel="사진 닫기"
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + 8 }]}>
          <CloseIcon size={18} color="#FFFFFF" />
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
  page: {
    overflow: 'hidden',
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
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
});

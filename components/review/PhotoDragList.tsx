import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const THUMB = 72;
const GAP = 8;
const STEP = THUMB + GAP;

interface ThumbProps {
  uri: string;
  index: number;
  count: number;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  setDragging: (v: boolean) => void;
}

// 길게 누르면 드래그가 시작되고, 끌고 있는 동안 삽입 위치(targetIndex)를 실시간 계산해
// 나머지 썸네일이 그 자리로 즉시 비켜난다. 놓으면 배열을 재정렬하고, 활성 썸네일의
// 이동분을 tx 에서 빼서 새 레이아웃 위치로 잔여 오차만 부드럽게 정착시킨다.
function Thumb({
  uri,
  index,
  count,
  activeIndex,
  targetIndex,
  onMove,
  onRemove,
  setDragging,
}: ThumbProps) {
  const tx = useSharedValue(0);
  const isActive = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      isActive.value = 1;
      activeIndex.value = index;
      targetIndex.value = index;
      runOnJS(setDragging)(true);
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      targetIndex.value = Math.max(
        0,
        Math.min(count - 1, index + Math.round(e.translationX / STEP)),
      );
    })
    .onEnd(() => {
      const from = index;
      const to = targetIndex.value;
      if (to !== from) {
        // 재정렬로 레이아웃이 (to-from)*STEP 만큼 이동하므로 그만큼 빼서 시각적 연속 유지
        tx.value = tx.value - (to - from) * STEP;
        runOnJS(onMove)(from, to);
      } else {
        activeIndex.value = -1;
        targetIndex.value = -1;
      }
      tx.value = withTiming(0, { duration: 160 });
      isActive.value = 0;
      runOnJS(setDragging)(false);
    })
    .onFinalize((_e, success) => {
      // 제스처가 취소된 경우(onEnd 미도달)만 정리
      if (!success) {
        tx.value = withTiming(0, { duration: 160 });
        isActive.value = 0;
        activeIndex.value = -1;
        targetIndex.value = -1;
        runOnJS(setDragging)(false);
      }
    });

  const style = useAnimatedStyle(() => {
    if (isActive.value) {
      return {
        transform: [{ translateX: tx.value }, { scale: withTiming(1.07, { duration: 120 }) }],
        zIndex: 10,
      };
    }
    // 드래그 중인 이웃을 위해 비켜나기 — 삽입 위치와 내 위치 사이에 있으면 한 칸 이동
    const a = activeIndex.value;
    const t = targetIndex.value;
    let shift = 0;
    if (a >= 0 && t >= 0) {
      if (index > a && index <= t) shift = -STEP;
      else if (index < a && index >= t) shift = STEP;
    }
    return {
      transform: [
        // 드래그 중에만 애니메이션 — 끝나는 순간엔 재정렬 레이아웃과 겹치지 않게 즉시 0
        { translateX: a >= 0 ? withTiming(shift, { duration: 150 }) : 0 },
        { scale: withTiming(1, { duration: 120 }) },
      ],
      zIndex: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.thumb, style]}>
        <Image source={{ uri }} style={styles.image} />
        <Pressable onPress={() => onRemove(index)} hitSlop={6} style={styles.remove}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

interface Props {
  uris: string[];
  onChange: (next: string[]) => void;
  onAdd: () => void;
  max: number;
}

// 리뷰 사진 썸네일 목록 (작성·수정 공용) — 다중 추가 버튼 + 길게 눌러 드래그로 순서 변경
export default function PhotoDragList({ uris, onChange, onAdd, max }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [dragging, setDragging] = useState(false);
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);

  const move = (from: number, to: number) => {
    const next = [...uris];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    // 재정렬 커밋과 같은 사이클에 리셋해야 비켜난 썸네일이 튀지 않는다
    activeIndex.value = -1;
    targetIndex.value = -1;
  };

  const remove = (index: number) => {
    onChange(uris.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!dragging}>
        <View style={styles.row}>
          {uris.map((uri, i) => (
            <Thumb
              key={uri}
              uri={uri}
              index={i}
              count={uris.length}
              activeIndex={activeIndex}
              targetIndex={targetIndex}
              onMove={move}
              onRemove={remove}
              setDragging={setDragging}
            />
          ))}
          {uris.length < max && (
            <Pressable
              onPress={onAdd}
              style={[
                styles.add,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}>
              <Text style={[styles.addIcon, { color: colors.textSecondary }]}>+</Text>
              <Text style={[styles.addText, { color: colors.textSecondary }]}>
                {uris.length}/{max}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      {uris.length >= 2 && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          사진을 길게 눌러 순서를 바꿀 수 있어요
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
  },
  image: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
  },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  add: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    fontSize: 24,
    fontWeight: '300',
  },
  addText: {
    fontSize: 10,
    marginTop: 2,
  },
  hint: {
    fontSize: 11,
  },
});

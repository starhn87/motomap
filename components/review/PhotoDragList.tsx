import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  LinearTransition,
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
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  setDragging: (v: boolean) => void;
}

// 길게 누르면 드래그가 활성화되고, 놓는 위치의 칸으로 이동한다.
// 나머지 썸네일은 LinearTransition 이 자리를 비켜주듯 부드럽게 재배치한다.
function Thumb({ uri, index, count, onMove, onRemove, setDragging }: ThumbProps) {
  const tx = useSharedValue(0);
  const active = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      active.value = 1;
      runOnJS(setDragging)(true);
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
    })
    .onEnd(() => {
      const to = Math.max(0, Math.min(count - 1, index + Math.round(tx.value / STEP)));
      if (to !== index) runOnJS(onMove)(index, to);
    })
    .onFinalize(() => {
      tx.value = 0;
      active.value = 0;
      runOnJS(setDragging)(false);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { scale: withTiming(active.value ? 1.07 : 1, { duration: 120 }) },
    ],
    zIndex: active.value ? 10 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View layout={LinearTransition.duration(180)} style={[styles.thumb, style]}>
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

  const move = (from: number, to: number) => {
    const next = [...uris];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
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

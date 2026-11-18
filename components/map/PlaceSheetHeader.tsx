import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useBottomSheet,
  type BottomSheetBackdropProps, type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/AppText';
import BackIcon from '@/components/ui/BackIcon';
import GlassButton from '@/components/ui/GlassButton';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import PlaceSheetCollapseHandle from './PlaceSheetCollapseHandle';

type Header = { top: number; onClose: () => void; actions: ReactNode };
const HeaderContext = createContext<{ expanded: boolean; header: Header | null }>({ expanded: false, header: null });

export function PlaceSheetHeaderProvider({ animatedIndex, header, children }: {
  animatedIndex: SharedValue<number>; header: Header | null; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  // 스냅 중에는 헤더 조작부만 구독한다. 장소 본문은 children으로 그대로 유지한다.
  useAnimatedReaction(
    () => animatedIndex.value >= 1.99,
    (next, previous) => { if (next !== !!previous) runOnJS(setExpanded)(next); },
  );
  return <HeaderContext.Provider value={{ expanded, header }}>{children}</HeaderContext.Provider>;
}

export function PlaceSheetBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  const { expanded } = useContext(HeaderContext);
  return <View pointerEvents={pointerEvents} accessible accessibilityRole="adjustable" accessibilityLabel="Bottom Sheet"
    style={[style, { borderRadius: expanded ? 0 : 24 }]} />;
}

// backdrop 슬롯은 고정 헤더도 본래 시트 핸들과 같은 제스처 컨텍스트에서 처리하게 한다.
export function PlaceSheetHeaderOverlay({ animatedIndex }: BottomSheetBackdropProps) {
  const { expanded, header } = useContext(HeaderContext);
  const { snapToIndex } = useBottomSheet();
  const colors = Colors[useColorScheme() ?? 'light'];
  const visibility = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [1.94, 2], [0, 1], Extrapolation.CLAMP),
  }));
  if (!header) return null;
  return (
    <Animated.View
      pointerEvents={expanded ? 'box-none' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      style={[styles.pageHeader, { paddingTop: header.top, backgroundColor: colors.background }, visibility]}>
      <GlassButton accessibilityLabel="뒤로" accessibilityRole="button" onPress={header.onClose} style={styles.back}>
        <BackIcon size={28} color={colors.text} />
      </GlassButton>
      <PlaceSheetCollapseHandle onCollapse={() => snapToIndex(1)} />
      <View style={styles.headerActions}>{header.actions}</View>
    </Animated.View>
  );
}

export function PlaceSheetNameRow({ name, onPress, children }: {
  name: string; onPress: () => void; children: ReactNode;
}) {
  const { expanded } = useContext(HeaderContext);
  const { animatedIndex } = useBottomSheet();
  const colors = Colors[useColorScheme() ?? 'light'];
  const visibility = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [1.94, 2], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <View style={styles.nameRow}>
      <Pressable accessibilityLabel={`${name} 상세 펼치기`} accessibilityRole="button"
        accessibilityState={{ expanded }} onPress={onPress} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.nameContent}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}
          textBreakStrategy="balanced" lineBreakStrategyIOS="push-out">{name}</Text>
      </View>
      <Animated.View
        pointerEvents={expanded ? 'none' : 'auto'}
        accessibilityElementsHidden={expanded}
        importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
        style={[styles.inlineActions, visibility]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  name: { fontSize: 22, fontWeight: '700' },
  nameContent: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingRight: 16 },
  inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

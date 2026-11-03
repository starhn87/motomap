import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewProps } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 모듈이 없는 옛 바이너리에서는 GlassView 모듈 자체를 평가하지 않는다.
// OS 번호만으로 추측하지 않고 컴파일·런타임 API 가용성을 함께 확인한다.
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<{
  isLiquidGlassAvailable?: boolean;
  isGlassEffectAPIAvailable?: boolean;
}>('ExpoGlassEffect') : null;
const NativeGlass = native?.isLiquidGlassAvailable === true && native.isGlassEffectAPIAvailable === true
  ? (require('expo-glass-effect') as typeof import('expo-glass-effect')).GlassView : null;

/** 조작 요소의 바탕만 Glass로 그린다. 자식의 터치·접근성·배치는 바꾸지 않는다. */
export default function GlassSurface({ style, children, ...props }: ViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  // 접근성 설정 조회 전에도 불투명 배경으로 안전하게 시작한다.
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    if (!NativeGlass) return;
    let alive = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true;
      if (alive) setReduceTransparency(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (alive && !changed) setReduceTransparency(value);
    }).catch(() => { /* 설정을 읽지 못하면 불투명 표면을 유지한다. */ });
    return () => { alive = false; subscription.remove(); };
  }, []);
  const glass = !!NativeGlass && !reduceTransparency;
  const radius = StyleSheet.flatten(style)?.borderRadius ?? 12;
  return <View {...props} style={[styles.surface, style,
    { backgroundColor: glass ? 'transparent' : colors.surfaceElevated,
      borderColor: glass ? 'transparent' : colors.border }]}>
    {glass && NativeGlass && <NativeGlass pointerEvents="none" colorScheme={scheme} glassEffectStyle="regular"
      style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />}
    {children}
  </View>;
}

const styles = StyleSheet.create({
  surface: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});

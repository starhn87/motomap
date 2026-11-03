import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState, type ReactNode } from 'react';
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
type Props = Omit<ViewProps, 'children'> & {
  interactive?: boolean;
  glassEffectStyle?: 'regular' | 'clear';
  children?: ReactNode | ((nativeGlass: boolean) => ReactNode);
};

export default function GlassSurface({ style, children, interactive = false, glassEffectStyle = 'regular', ...props }: Props) {
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
  const content = typeof children === 'function' ? children(glass) : children;
  const surfaceStyle = [styles.surface, style,
    { backgroundColor: glass ? 'transparent' : colors.surfaceElevated,
      borderColor: glass ? 'transparent' : colors.border }];
  // 실제 버튼을 효과의 contentView에 넣어 UIKit이 터치를 추적하게 한다.
  // 배경만 pointerEvents=none으로 두면 네이티브 상호작용이 터치를 받을 수 없다.
  if (glass && NativeGlass) return <NativeGlass {...props} colorScheme={scheme}
    glassEffectStyle={glassEffectStyle} tintColor={scheme === 'dark' ? '#FFFFFF18' : '#FFFFFF50'}
    isInteractive={interactive} style={surfaceStyle}>{content}</NativeGlass>;
  return <View {...props} style={surfaceStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  surface: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});

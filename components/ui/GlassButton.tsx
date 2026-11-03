import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import GlassSurface from './GlassSurface';

type Props = Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: ReactNode; compact?: boolean; glassEffectStyle?: 'regular' | 'clear' };

/** 네이티브 글래스의 터치 반응을 사용하고, 미지원 환경에서만 투명도 피드백을 준다. */
export default function GlassButton({ style, children, disabled, compact = false, glassEffectStyle, ...props }: Props) {
  return <GlassSurface interactive={!disabled} glassEffectStyle={glassEffectStyle} style={style}>
    {native => <Pressable {...props} disabled={disabled} style={({ pressed }) => [styles.content,
      { opacity: disabled ? 0.4 : pressed && !native ? 0.7 : 1 }, compact && styles.compact]}>{children}</Pressable>}
  </GlassSurface>;
}

const styles = StyleSheet.create({
  content: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 },
  compact: { minWidth: 36, minHeight: 36 },
});

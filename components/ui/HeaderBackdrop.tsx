import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 아직 Blur 모듈이 없는 설치본에서도 JS를 안전하게 읽을 수 있게 한다.
const Blur = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoBlur')
  ? (require('expo-blur') as typeof import('expo-blur')).BlurView : null;

export default function HeaderBackdrop() {
  const scheme = useColorScheme() ?? 'light';
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (!Blur) return;
    let alive = true, changed = false;
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true; if (alive) setReduced(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (alive && !changed) setReduced(value);
    }).catch(() => {});
    return () => { alive = false; sub.remove(); };
  }, []);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill,
    { backgroundColor: Blur && !reduced ? 'transparent' : Colors[scheme].background }]}>
    {Blur && !reduced && <Blur tint={scheme === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
      intensity={65} style={StyleSheet.absoluteFill} />}
  </View>;
}

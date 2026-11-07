import { NativeModules, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';
import { posthog } from '@/lib/analytics';
import { useAuthStore } from '@/stores/useAuthStore';

export const ERROR_TRACKING_PROBE_ID = 'motomap-error-tracking-probe';

/**
 * EXPO_PUBLIC_ERROR_TRACKING_PROBE=1 인 번들에서만 Metro가 이 파일을 포함한다.
 * 로그인 세션이 있으면 아무 것도 하지 않는다.
 */
export function ErrorTrackingProbeHost() {
  const signedIn = useAuthStore((state) => state.status === 'signed_in' || state.session != null);
  if (signedIn) return null;

  function markProbe() {
    posthog?.identify(ERROR_TRACKING_PROBE_ID);
  }

  return (
    <View pointerEvents="box-none" style={styles.dock}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="검증용 JS 오류"
        style={styles.button}
        onPress={() => {
          markProbe();
          throw new Error('motomap error tracking probe js');
        }}>
        <Text style={styles.label}>검증 JS 오류</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="검증용 네이티브 크래시"
        style={styles.button}
        onPress={() => {
          markProbe();
          NativeModules.MotomapErrorTrackingProbe?.triggerNativeCrash?.();
        }}>
        <Text style={styles.label}>검증 네이티브 종료</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 16, right: 16, bottom: 32, gap: 8 },
  button: { backgroundColor: '#3F1D1D', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  label: { color: '#F5F5F2', fontSize: 15 },
});

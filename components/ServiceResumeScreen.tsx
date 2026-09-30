import { Image, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

interface Props {
  mode: 'update' | 'retry';
  onRetry: () => void;
  storeUrl: string;
}

export default function ServiceResumeScreen({ mode, onRetry, storeUrl }: Props) {
  const updateRequired = mode === 'update';
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image source={require('../assets/images/icon.png')} style={styles.icon} />
        <Text style={styles.eyebrow}>운영 재개 안내</Text>
        <Text style={styles.title}>
          {updateRequired ? '새 버전으로 다시 만나요' : '업데이트를 확인하지 못했어요'}
        </Text>
        <Text style={styles.description}>
          {updateRequired
            ? '모토맵을 다시 사용하려면 App Store에서 최신 버전으로 업데이트해 주세요.'
            : '연결 상태를 확인한 뒤 다시 시도해 주세요. 계속 안 된다면 App Store에서 최신 버전으로 업데이트할 수 있어요.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(storeUrl)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>App Store에서 업데이트</Text>
        </Pressable>
        {!updateRequired && (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>다시 시도</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  icon: { width: 72, height: 72, borderRadius: 20, marginBottom: 34 },
  eyebrow: { color: '#79CFFF', fontSize: 14, fontWeight: '800', marginBottom: 13 },
  title: { color: '#F5F5F2', fontSize: 29, lineHeight: 38, fontWeight: '800' },
  description: { color: '#ABADB3', fontSize: 17, lineHeight: 27, marginTop: 18, marginBottom: 34 },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F5F5F2',
  },
  primaryButtonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#9B9DA3', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});

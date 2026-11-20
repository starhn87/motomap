import { Image, Linking, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

export default function ServiceResumeScreen({ storeUrl }: { storeUrl: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image source={require('../assets/images/icon.png')} style={styles.icon} />
        <Text style={styles.title}>앱을 업데이트해 주세요</Text>
        <Text style={styles.description}>모토맵을 사용하려면 최신 버전이 필요해요.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(storeUrl)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>App Store에서 업데이트</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  icon: { width: 72, height: 72, borderRadius: 20, marginBottom: 34 },
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
  pressed: { opacity: 0.72 },
});

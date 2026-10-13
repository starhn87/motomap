import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { setupResumeStoreLink } from './notificationAdapter';

const STORE_URL = 'https://apps.apple.com/kr/app/id6773636183';

// 구버전에는 서비스 진입을 열지 않는다. 지도·GPS·로그인·DB를 시작하지 않는 연결 화면이다.
export default function App() {
  const [stage, setStage] = useState<'checking' | 'update' | 'unavailable'>('checking');
  const [error, setError] = useState(false);

  async function checkStatus() {
    setStage('checking');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch('https://motomap.kr/service-status', {
        signal: controller.signal, headers: { 'Cache-Control': 'no-cache' },
      });
      const status = response.ok ? await response.json() : null;
      setStage(status?.schemaVersion === 1 && status.status === 'active' ? 'update' : 'unavailable');
    } catch {
      setStage('unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    const cleanup = setupResumeStoreLink();
    void checkStatus();
    return cleanup;
  }, []);

  async function openStore() {
    setError(false);
    try { await Linking.openURL(STORE_URL); } catch { setError(true); }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Image source={require('./icon.png')} style={styles.icon} />
        <Text style={styles.title}>{stage === 'update' ? '모토맵이 돌아왔어요' : stage === 'checking' ? '모토맵' : '서비스 상태를 확인해 주세요'}</Text>
        <Text style={styles.body}>{stage === 'update'
          ? 'App Store에서 최신 버전으로 업데이트하고\n다시 라이딩을 시작해 보세요.'
          : stage === 'checking' ? '서비스 상태를 불러오고 있어요.'
            : '연결 상태를 확인하고 다시 시도해 주세요.\n최신 앱은 App Store에서 받을 수 있어요.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => void openStore()} style={styles.button}>
          <Text style={styles.buttonText}>App Store에서 업데이트</Text>
        </Pressable>
        {stage !== 'update' ? <Pressable accessibilityRole="button" onPress={() => void checkStatus()} style={styles.retry}>
          <Text style={styles.body}>다시 확인</Text>
        </Pressable> : null}
        {error ? <Text style={styles.body}>App Store를 열지 못했어요. 다시 눌러 주세요.</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center' },
  card: { alignItems: 'center', padding: 28, gap: 24 },
  icon: { width: 72, height: 72, borderRadius: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  body: { color: '#a1a1aa', fontSize: 16, lineHeight: 25, textAlign: 'center' },
  button: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16, backgroundColor: '#fff' },
  buttonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
  retry: { padding: 12 },
});

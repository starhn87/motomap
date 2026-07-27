import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';

import KakaoNavi from '@/modules/kakao-navi';
import { toast } from '@/lib/toast';

// 앱 안 이륜차 길안내. 화면은 SDK 가 네이티브 전체화면으로 띄우므로
// 이 라우트는 위치를 잡아 넘기고 종료를 기다리는 역할만 한다.
export default function NaviScreen() {
  const router = useRouter();
  const { lng, lat, name } = useLocalSearchParams<{
    lng: string;
    lat: string;
    name?: string;
  }>();

  useEffect(() => {
    const end = KakaoNavi.addListener('onGuideEnd', () => router.back());
    const failed = KakaoNavi.addListener('onGuideFailed', ({ message }) => {
      toast.error('길안내를 시작할 수 없습니다', message);
      router.back();
    });

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.error('위치 권한이 필요합니다', '길안내를 시작할 수 없습니다.');
        router.back();
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await KakaoNavi.startGuide(
        current.coords.longitude,
        current.coords.latitude,
        Number(lng),
        Number(lat),
        name ?? '목적지',
      );
    })().catch(() => {
      toast.error('현재 위치를 확인할 수 없습니다');
      router.back();
    });

    return () => {
      end.remove();
      failed.remove();
    };
  }, [lng, lat, name, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
});

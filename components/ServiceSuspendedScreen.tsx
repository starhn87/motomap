import { Image, Linking, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

const PRIVACY_URL = 'https://motomap.kr/privacy';
const SUPPORT_EMAIL_URL =
  'mailto:starhn87@gmail.com?subject=' + encodeURIComponent('[모토맵] 계정·데이터 문의');

interface Props {
  preparing?: boolean;
  onCheckStatus?: () => void;
}

export default function ServiceSuspendedScreen({ preparing, onCheckStatus }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image
          accessibilityElementsHidden
          source={require('../assets/images/icon.png')}
          style={styles.brandIcon}
        />

        <Text style={styles.eyebrow}>서비스 이용 안내</Text>
        <Text style={styles.title}>
          {preparing ? '운영 재개를 준비하고 있어요' : '서비스 운영이 중단됐어요'}
        </Text>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            현재 앱은 위치를 수집하거나 지도·길안내 기능을 시작하지 않습니다.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(SUPPORT_EMAIL_URL)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>계정·데이터 문의</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
          <Text style={styles.linkButtonText}>개인정보 처리방침</Text>
        </Pressable>
        {onCheckStatus && (
          <Pressable
            accessibilityRole="button"
            onPress={onCheckStatus}
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
            <Text style={styles.linkButtonText}>운영 상태 다시 확인</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  brandIcon: {
    width: 72,
    height: 72,
    marginBottom: 34,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  eyebrow: {
    marginBottom: 13,
    color: '#79CFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  title: {
    color: '#F5F5F2',
    fontSize: 31,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -1.1,
  },
  notice: {
    marginTop: 18,
    marginBottom: 34,
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderRadius: 16,
    backgroundColor: '#15171A',
    borderWidth: 1,
    borderColor: '#25282D',
  },
  noticeText: {
    color: '#D5D6D8',
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F5F5F2',
  },
  primaryButtonText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: '800',
  },
  linkButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    color: '#9B9DA3',
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});

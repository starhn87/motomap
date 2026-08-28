import { Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

const PRIVACY_URL = 'https://motomap.kr/privacy';
const SUPPORT_EMAIL_URL =
  'mailto:starhn87@gmail.com?subject=' + encodeURIComponent('[모토맵] 계정·데이터 문의');

export default function ServiceSuspendedScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandMark} accessibilityElementsHidden>
          <View style={styles.brandRoad} />
        </View>

        <Text style={styles.eyebrow}>운영 일시 중단</Text>
        <Text style={styles.title}>모토맵을 잠시 멈춥니다</Text>
        <Text style={styles.description}>
          서비스 운영 체계를 정비하고 있어요.{`\n`}정비를 마친 뒤 다시 안내드리겠습니다.
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
  brandMark: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
    borderRadius: 17,
    backgroundColor: '#17191C',
    borderWidth: 1,
    borderColor: '#292C31',
  },
  brandRoad: {
    width: 8,
    height: 31,
    borderRadius: 4,
    backgroundColor: '#79CFFF',
    transform: [{ rotate: '28deg' }],
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
  description: {
    marginTop: 18,
    color: '#ABADB3',
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: -0.35,
  },
  notice: {
    marginTop: 30,
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

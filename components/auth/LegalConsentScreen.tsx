import { useState } from 'react';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEGAL_DOCS, LEGAL_CHANGE_SUMMARY, LEGAL_PUBLICATION, type LegalDocType } from '@/constants/legal';
import { acceptCurrentLegalDocuments } from '@/lib/legalConsent';
import { useAuthStore } from '@/stores/useAuthStore';

const TYPES: LegalDocType[] = ['terms', 'privacy', 'location'];
const URLS = { terms: 'https://motomap.kr/terms', privacy: 'https://motomap.kr/privacy',
  location: 'https://motomap.kr/location-terms' };

export default function LegalConsentScreen({ onReady }: { onReady?: () => void }) {
  const [agreed, setAgreed] = useState<Partial<Record<LegalDocType, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useAuthStore((state) => state.refreshOnboardingStatus);
  const signOut = useAuthStore((state) => state.signOut);
  const accepted = TYPES.every((type) => agreed[type]);

  async function accept() {
    if (!accepted || loading) return;
    setLoading(true);
    setError('');
    try {
      await acceptCurrentLegalDocuments();
      await refresh();
    } catch {
      setError('동의를 저장하지 못했어요. 기존 동의는 보존되어 있으니 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  async function browseWithoutAccount() {
    if (loading) return;
    setLoading(true);
    setError('');
    try { await signOut('local'); }
    catch { setError('로그아웃하지 못했어요. 다시 시도해 주세요.'); }
    finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.screen} onLayout={onReady}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>운영 재개 안내와 약관 확인</Text>
        <Text style={styles.body}>모토맵을 다시 시작해요. 변경된 내용을 확인하고 동의해 주세요.</Text>
        <Text style={styles.body}>시행일: {LEGAL_PUBLICATION.effectiveDate}</Text>
        <View style={styles.summary}>
          {LEGAL_CHANGE_SUMMARY.map((item) => <Text key={item} style={styles.body}>· {item}</Text>)}
        </View>
        <Text style={styles.body}>기존 동의와 내 기록은 그대로 보존돼요. 새 동의만 별도 이력으로 추가해요.</Text>
        {TYPES.map((type) => (
          <View key={type} style={styles.row}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!agreed[type], disabled: loading }}
              disabled={loading} style={styles.agreement}
              onPress={() => setAgreed((value) => ({ ...value, [type]: !value[type] }))}>
              <View style={[styles.checkbox, agreed[type] && styles.checked]}>
                {agreed[type] && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.label}>{LEGAL_DOCS[type].title} (필수)</Text>
            </Pressable>
            <Pressable accessibilityRole="link" style={styles.viewLink}
              onPress={() => { void Linking.openURL(URLS[type]).catch(() => setError('문서를 열지 못했어요. 다시 시도해 주세요.')); }}>
              <Text style={styles.link}>보기</Text>
            </Pressable>
          </View>
        ))}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={!accepted || loading}
          accessibilityState={{ disabled: !accepted || loading }} onPress={() => void accept()}
          style={({ pressed }) => [styles.button, (!accepted || loading || pressed) && styles.dimmed]}>
          <Text style={styles.buttonText}>{loading ? '확인 중…' : '동의하고 시작하기'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void browseWithoutAccount()}
          style={styles.browse}>
          <Text style={styles.link}>로그아웃하고 둘러보기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { padding: 24, paddingBottom: 40, gap: 16 },
  title: { color: '#F5F5F2', fontWeight: '700', fontSize: 25, lineHeight: 34 },
  body: { color: '#C4C5C8', fontSize: 15, lineHeight: 23 },
  summary: { padding: 16, gap: 12, backgroundColor: '#1B1B1D', borderRadius: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agreement: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: '#8E8E93', borderRadius: 6,
    alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#F5F5F2', borderColor: '#F5F5F2' },
  checkmark: { color: '#0A0A0A', fontSize: 17, fontWeight: '700' },
  label: { flex: 1, color: '#F5F5F2', fontSize: 14, lineHeight: 21 },
  viewLink: { minHeight: 48, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  link: { color: '#C4C5C8', fontSize: 14 },
  error: { color: '#F5F5F2', fontSize: 14, lineHeight: 22 },
  button: { minHeight: 54, borderRadius: 14, backgroundColor: '#F5F5F2', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
  dimmed: { opacity: 0.5 },
  browse: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});

import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEGAL_DOCS, type LegalDocType } from '@/constants/legal';
import { acceptCurrentLegalDocuments } from '@/lib/legalConsent';
import { LOCATION_CONSENT_VERSION, LOCATION_PROVIDERS, LOCATION_PROVIDER_DETAILS, RECIPIENT_LABELS,
  type LocationRecipient } from '@/lib/locationPrivacy';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { useAuthStore } from '@/stores/useAuthStore';

const TYPES: LegalDocType[] = ['terms', 'privacy', 'location'];

export default function LegalConsentScreen({ needsLegal = true, onReady, onComplete }:
  { needsLegal?: boolean; onReady?: () => void; onComplete?: () => void }) {
  const state = useLocationPrivacyStore();
  const [agreed, setAgreed] = useState<Partial<Record<LegalDocType, boolean>>>({});
  const [providers, setProviders] = useState<LocationRecipient[]>(() => state.version === LOCATION_CONSENT_VERSION
    ? state.providers.filter(p => p !== 'naver') : LOCATION_PROVIDERS.filter(p => p !== 'tmap'));
  const [viewing, setViewing] = useState<LegalDocType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const types = needsLegal ? TYPES : ['location'] as const;
  const accepted = types.every(type => agreed[type]);

  async function accept() {
    if (!accepted || submitting.current) return;
    submitting.current = true; setLoading(true); setError('');
    const actor = state.actor;
    const session = useAuthStore.getState().session;
    try {
      if (actor !== (useAuthStore.getState().session?.user.id ?? null)) throw new Error('계정이 변경됐어요. 다시 확인해 주세요.');
      // 최초 저장 선택은 꺼둔다. 이미 선택한 이용자의 기록 설정은 그대로 보존한다.
      await state.consent(true, true, state.historyAllowed, providers);
      if (actor !== (useAuthStore.getState().session?.user.id ?? null)) throw new Error('계정이 변경됐어요. 다시 확인해 주세요.');
      if (needsLegal) {
        if (!session || session.user.id !== actor) throw new Error('로그인 상태를 다시 확인해 주세요.');
        await acceptCurrentLegalDocuments({access_token:session.access_token,user:{id:session.user.id}});
        if (actor !== (useAuthStore.getState().session?.user.id ?? null)) throw new Error('계정이 변경됐어요. 다시 확인해 주세요.');
        await useAuthStore.getState().refreshOnboardingStatus();
      }
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '동의를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { submitting.current = false; setLoading(false); }
  }
  async function browse() {
    if (submitting.current) return;
    submitting.current = true; setLoading(true); setError('');
    try {
      if (needsLegal) {
        await useAuthStore.getState().signOut('local');
        await useLocationPrivacyStore.getState().load(null);
      }
      useLocationPrivacyStore.getState().browse();
    } catch { setError('처리하지 못했어요. 다시 시도해 주세요.'); }
    finally { submitting.current = false; setLoading(false); }
  }

  return <SafeAreaView style={styles.screen} onLayout={onReady}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>모토맵 시작하기</Text>
      <Text style={styles.body}>필요한 동의를 확인해 주세요. 설정에서 언제든 바꿀 수 있어요.</Text>
      {types.map(type => <View key={type} style={styles.row}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!agreed[type], disabled: loading }}
          disabled={loading} style={styles.agreement} onPress={() => setAgreed(old => ({ ...old, [type]: !old[type] }))}>
          <View style={[styles.checkbox, agreed[type] && styles.checked]}>{agreed[type] && <Text style={styles.checkmark}>✓</Text>}</View>
          <Text style={styles.label}>{type === 'terms' ? '만 14세 이상 · 이용약관 동의'
            : type === 'privacy' ? '개인정보 처리방침 동의'
            : needsLegal ? '위치정보 이용·전달 동의' : '만 14세 이상 · 위치 이용·전달 동의'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${LEGAL_DOCS[type].title} 보기`}
          style={styles.viewLink} onPress={() => setViewing(type)}><Text style={styles.link}>보기</Text></Pressable>
      </View>)}
      <Text style={styles.body}>현재 위치는 네이버 지도와 카카오 길안내·날씨·유가·AI 추천에 사용될 수 있어요.
        {'\n'}위치 동의의 자세히 보기에서 전달 범위를 선택할 수 있어요. 방문 기록 저장은 설정에서 따로 켤 수 있어요.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="동의하고 시작하기" disabled={!accepted || loading}
        accessibilityState={{ disabled: !accepted || loading, busy: loading }}
        onPress={() => void accept()} style={({ pressed }) => [styles.button, (!accepted || loading || pressed) && styles.dimmed]}>
        {loading ? <ActivityIndicator size="small" color="#0A0A0A" /> : <Text style={styles.buttonText}>동의하고 시작하기</Text>}
      </Pressable>
      {!onComplete && <Pressable accessibilityRole="button" disabled={loading} style={styles.browse} onPress={() => void browse()}>
        <Text style={styles.link}>{needsLegal ? '로그아웃하고 둘러보기' : '현재 위치 없이 둘러보기'}</Text>
      </Pressable>}
      {!!state.error && <Text style={styles.error}>{state.error}</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!state.ready && <Pressable accessibilityRole="button" style={styles.browse} disabled={loading}
        onPress={() => { void state.load(state.actor); }}><Text style={styles.link}>다시 확인하기</Text></Pressable>}
    </ScrollView>
    <Modal visible={viewing !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setViewing(null)}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.documentHeader}>
          <Text accessibilityRole="header" style={styles.documentTitle}>{viewing && LEGAL_DOCS[viewing].title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="약관 문서 닫기" style={styles.viewLink}
            onPress={() => setViewing(null)}><Text style={styles.link}>닫기</Text></Pressable>
        </View>
        <ScrollView key={viewing} contentContainerStyle={styles.content}>
          {viewing === 'location' && <>
            <Text style={styles.documentTitle}>위치 전달 범위</Text>
            <Text style={styles.body}>시작 화면의 위치 동의가 아래 선택한 범위를 포함해요. 선택하지 않은 서비스에는 위치를 보내지 않아요.</Text>
            {LOCATION_PROVIDERS.map(provider => <View key={provider} style={styles.provider}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: providers.includes(provider), disabled: loading }} disabled={loading}
                style={styles.agreement} onPress={() => setProviders(old => old.includes(provider) ? old.filter(p => p !== provider) : [...old, provider])}>
                <View style={[styles.checkbox, providers.includes(provider) && styles.checked]}>{providers.includes(provider) && <Text style={styles.checkmark}>✓</Text>}</View>
                <Text style={styles.label}>{RECIPIENT_LABELS[provider]}</Text>
              </Pressable><Text style={styles.body}>{LOCATION_PROVIDER_DETAILS[provider]}</Text>
            </View>)}
          </>}
          <Text style={styles.body}>{viewing && LEGAL_DOCS[viewing].content}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' }, content: { padding: 24, paddingBottom: 40, gap: 18 },
  title: { color: '#F5F5F2', fontWeight: '700', fontSize: 25, lineHeight: 34 }, body: { color: '#C4C5C8', fontSize: 14, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, agreement: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: '#8E8E93', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#F5F5F2', borderColor: '#F5F5F2' }, checkmark: { color: '#0A0A0A', fontSize: 17, fontWeight: '700' },
  label: { flex: 1, color: '#F5F5F2', fontSize: 14, lineHeight: 21 }, provider: { gap: 6 },
  viewLink: { minHeight: 48, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, link: { color: '#C4C5C8', fontSize: 14 },
  documentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  documentTitle: { flex: 1, color: '#F5F5F2', fontWeight: '700', fontSize: 18, lineHeight: 26 }, error: { color: '#F5F5F2', fontSize: 14, lineHeight: 22 },
  button: { minHeight: 54, borderRadius: 14, backgroundColor: '#F5F5F2', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '700' }, dimmed: { opacity: 0.5 }, browse: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});

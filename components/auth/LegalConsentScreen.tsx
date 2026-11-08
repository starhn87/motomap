import { useRef, useState } from 'react';
import GlassButton from '@/components/ui/GlassButton';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';
import { LEGAL_DOCS, type LegalDocType } from '@/constants/legal';
import { acceptCurrentLegalDocuments } from '@/lib/legalConsent';
import { LOCATION_CONSENT_VERSION, LOCATION_PROVIDERS, LOCATION_PROVIDER_DETAILS, RECIPIENT_LABELS,
  type LocationRecipient } from '@/lib/locationPrivacy';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { useAuthStore } from '@/stores/useAuthStore';

const TYPES: LegalDocType[] = ['terms', 'privacy', 'location'];
const VISIBLE_LOCATION_PROVIDERS = LOCATION_PROVIDERS.filter(provider => provider !== 'tmap');

export default function LegalConsentScreen({ needsLegal = true, showProvidersInline = false, onReady, onComplete }:
  { needsLegal?: boolean; showProvidersInline?: boolean; onReady?: () => void; onComplete?: () => void }) {
  const state = useLocationPrivacyStore();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[showProvidersInline ? colorScheme : 'dark'];
  const styles = themedStyles[showProvidersInline ? colorScheme : 'dark'];
  const [agreed, setAgreed] = useState<Partial<Record<LegalDocType, boolean>>>(() =>
    showProvidersInline && !needsLegal && state.ready && !state.error && state.version === LOCATION_CONSENT_VERSION
      && (state.status === 'active' || state.status === 'paused') ? { location: true } : {});
  const [providers, setProviders] = useState<LocationRecipient[]>(() => state.version === LOCATION_CONSENT_VERSION
    ? VISIBLE_LOCATION_PROVIDERS.filter(p => state.providers.includes(p)) : [...VISIBLE_LOCATION_PROVIDERS]);
  const [historyAllowed, setHistoryAllowed] = useState(() => state.historyAllowed);
  const [providersExpanded, setProvidersExpanded] = useState(false);
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
      // 저장은 별도 선택이다. 전달 범위만 편집할 때는 기존 기록 선택을 유지한다.
      // 종료된 제공자의 기존 동의·확인자료는 화면에서 숨겨도 보존한다.
      const savedProviders: LocationRecipient[] = [...providers];
      if (state.version === LOCATION_CONSENT_VERSION && state.providers.includes('tmap')) savedProviders.push('tmap');
      await state.consent(true, true, showProvidersInline ? state.historyAllowed : historyAllowed && !!actor, savedProviders);
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

  const providerChoices = <>
    <Text style={styles.documentTitle}>위치 전달 범위</Text>
    <Text style={styles.body}>선택한 전달 범위에 동의해 주세요. 선택하지 않은 서비스에는 위치를 보내지 않아요.</Text>
    {VISIBLE_LOCATION_PROVIDERS.map(provider => <View key={provider} style={styles.provider}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: providers.includes(provider), disabled: loading }} disabled={loading}
        style={styles.agreement} onPress={() => setProviders(old => old.includes(provider) ? old.filter(p => p !== provider) : [...old, provider])}>
        <View style={[styles.checkbox, providers.includes(provider) && styles.checked]}>{providers.includes(provider) && <Text style={styles.checkmark}>✓</Text>}</View>
        <Text style={styles.label}>{RECIPIENT_LABELS[provider]}</Text>
      </Pressable><Text style={styles.body}>{LOCATION_PROVIDER_DETAILS[provider]}</Text>
    </View>)}
  </>;

  const submitLabel = showProvidersInline
    ? (state.status === 'paused' ? '동의 저장 및 위치 사용 재개' : '동의하고 저장')
    : '동의하고 시작하기';

  return <SafeAreaView style={styles.screen} onLayout={onReady}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{showProvidersInline ? '위치 전달 범위 변경' : '모토맵 시작하기'}</Text>
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
      {showProvidersInline ? providerChoices : <>
        <Text style={styles.body}>현재 위치는 네이버 지도에 표시하고 선택한 기능에 사용해요.{'\n'}
          {providers.length ? `위치 전달: ${providers.map(provider => RECIPIENT_LABELS[provider]).join(', ')}` : '선택한 추가 전달 대상이 없어요.'}
        </Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="방문·주행 기록 저장 (선택)"
          accessibilityState={{ checked: historyAllowed, disabled: loading || !state.actor }}
          disabled={loading || !state.actor} style={styles.agreement}
          onPress={() => setHistoryAllowed(old => !old)}>
          <View style={[styles.checkbox, historyAllowed && styles.checked]}>{historyAllowed && <Text style={styles.checkmark}>✓</Text>}</View>
          <Text style={styles.label}>방문·주행 기록 저장 (선택)</Text>
        </Pressable>
        <Text style={styles.body}>{state.actor ? '방문한 장소와 주행 기록을 저장해요. 선택하지 않아도 길안내를 이용할 수 있어요.' : '기록 저장은 로그인 후 선택할 수 있어요.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="기능별 위치 전달 선택"
          accessibilityState={{ expanded: providersExpanded, disabled: loading }} disabled={loading}
          style={styles.scopeButton} onPress={() => setProvidersExpanded(old => !old)}>
          <Text style={styles.link}>기능별 위치 전달 선택</Text>
          <Text style={styles.link}>{providersExpanded ? '접기' : '보기'}</Text>
        </Pressable>
        {providersExpanded && providerChoices}
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel={submitLabel} disabled={!accepted || loading}
        accessibilityState={{ disabled: !accepted || loading, busy: loading }}
        onPress={() => void accept()} style={({ pressed }) => [styles.button, (!accepted || loading || pressed) && styles.dimmed]}>
        {loading ? <ActivityIndicator size="small" color={colors.background} /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
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
          <GlassButton accessibilityRole="button" accessibilityLabel="약관 문서 닫기"
            style={{ minWidth: 56, height: 44, borderRadius: 22 }}
            onPress={() => setViewing(null)}><Text style={[styles.link, { color: colors.text }]}>닫기</Text></GlassButton>
        </View>
        <ScrollView key={viewing} contentContainerStyle={styles.content}>
          {viewing === 'location' && !showProvidersInline && providerChoices}
          <Text style={styles.body}>{viewing && LEGAL_DOCS[viewing].content}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const makeStyles = (colors: typeof Colors.light) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 40, gap: 18 },
  title: { color: colors.text, fontWeight: '700', fontSize: 25, lineHeight: 34 }, body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  scopeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, agreement: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: colors.textSecondary, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.text, borderColor: colors.text }, checkmark: { color: colors.background, fontSize: 17, fontWeight: '700' },
  label: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 }, provider: { gap: 6 },
  viewLink: { minHeight: 48, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, link: { color: colors.textSecondary, fontSize: 14 },
  documentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  documentTitle: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 18, lineHeight: 26 }, error: { color: colors.text, fontSize: 14, lineHeight: 22 },
  button: { minHeight: 54, borderRadius: 14, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '700' }, dimmed: { opacity: 0.5 }, browse: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});

const themedStyles = { light: makeStyles(Colors.light), dark: makeStyles(Colors.dark) };

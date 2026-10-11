import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, Share } from 'react-native';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { locationPrivacyRpc, privacyObject, PURPOSE_LABELS, RECIPIENT_LABELS,
  type LocationRecipient, type LocationUsageEvent, type LocationRideRecord } from '@/lib/locationPrivacy';
import { LEGAL_DOCS, LEGAL_OPERATOR } from '@/constants/legal';
import type { Json } from '@/lib/database.types';
import { PostHogMaskView } from 'posthog-react-native';

const PROVIDERS = ['kakao','kma','airkorea','opinet','anthropic'] as const;
const PROVIDER_DETAILS = {
  kakao: '주변 검색·주소 확인·이륜차 경로/길안내: 기준 좌표·출발지·경유지·도착지',
  kma: '날씨: 조회 지점의 격자 위치',
  airkorea: '미세먼지: 조회 지점의 TM 좌표(카카오 좌표 변환도 필요)',
  opinet: '주변 유가: 조회 기준 좌표',
  anthropic: 'AI 추천: 함께 보낸 현재 위치(근사 좌표)·대화',
};

function listFrom<T>(value: Json, key: string, valid: (item: Record<string, Json | undefined>) => boolean): T[] {
  const values = privacyObject(value)[key];
  if (!Array.isArray(values)) throw new Error('자료를 확인하지 못했어요.');
  return values.map((item) => {
    const row = privacyObject(item);
    if (!valid(row)) throw new Error('자료를 확인하지 못했어요.');
    return row as T;
  });
}
export default function LocationPrivacyPanel({ intro = false, onReady }: { intro?: boolean; onReady?: () => void }) {
  const state = useLocationPrivacyStore();
  const [age, setAge] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [history, setHistory] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [providers, setProviders] = useState<LocationRecipient[]>([]);
  const [editing, setEditing] = useState(intro || state.status === 'unknown' || state.status === 'withdrawn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<LocationUsageEvent[]>([]);
  const [rides, setRides] = useState<LocationRideRecord[]>([]);
  const [loadedEvents, setLoadedEvents] = useState(false);
  const [loadedRides, setLoadedRides] = useState(false);

  function beginConsent() {
    setAge(false); setAgreed(false); setHistory(false); setProviders([]);
    setShowTerms(false); setEditing(true);
  }

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  function confirm(title: string, message: string, work: () => Promise<void>) {
    Alert.alert(title, message, [{ text: '취소', style: 'cancel' },
      { text: '확인', style: 'destructive', onPress: () => { void run(work); } }]);
  }
  async function loadEvents(more = false) {
    const requestState = useLocationPrivacyStore.getState();
    if (requestState.actor !== state.actor || requestState.secret !== state.secret) return;
    const value = await locationPrivacyRpc('events', requestState.secret,
      more && events.length ? { before: events[events.length - 1].created_at, beforeId: events[events.length - 1].id } : {}, requestState.actor);
    const current = useLocationPrivacyStore.getState();
    if (requestState.actor !== current.actor || requestState.revision !== current.revision) return;
    const rows = listFrom<LocationUsageEvent>(value,'events',(r) => typeof r.id==='string' && typeof r.created_at==='string'
      && typeof r.purpose==='string' && Object.hasOwn(PURPOSE_LABELS,r.purpose) && typeof r.recipient==='string'
      && Object.hasOwn(RECIPIENT_LABELS,r.recipient) && ['requested','completed','failed'].includes(String(r.outcome)));
    setEvents((old) => more ? [...old,...rows] : rows); setLoadedEvents(true);
  }
  async function loadRides(more = false) {
    const requestState = useLocationPrivacyStore.getState();
    if (requestState.actor !== state.actor || requestState.secret !== state.secret) return;
    const value = await locationPrivacyRpc('rides', requestState.secret,
      more && rides.length ? { before: rides[rides.length - 1].created_at, beforeId: rides[rides.length - 1].id } : {}, requestState.actor);
    const current = useLocationPrivacyStore.getState();
    if (requestState.actor !== current.actor || requestState.revision !== current.revision) return;
    const rows = listFrom<LocationRideRecord>(value,'rides',(r) => typeof r.id==='string' && typeof r.name==='string' && typeof r.created_at==='string' && ['visit','completion'].includes(String(r.kind)));
    setRides((old) => more ? [...old,...rows] : rows); setLoadedRides(true);
  }
  function requestCorrection(id: string) {
    void run(async () => { await Linking.openURL(`mailto:${LEGAL_OPERATOR.contactEmail}?subject=${encodeURIComponent('위치정보 열람·정정 요청')}&body=${encodeURIComponent(`대상 자료: ${id}\n요청 내용:\n\n비밀번호나 인증 코드는 보내지 마세요.`)}`); });
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || disabled }} disabled={busy || disabled}
      style={[styles.button,(busy || disabled) && styles.disabled]} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
  const check = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: busy }} disabled={busy}
      style={styles.check} onPress={onPress}><Text style={styles.label}>{selected ? '☑' : '☐'} {label}</Text></Pressable>
  );

  return <PostHogMaskView style={styles.screen}><ScrollView contentContainerStyle={styles.content} onLayout={onReady}>
    <Text style={styles.title}>{intro ? '위치정보 이용 안내' : '위치정보 관리'}</Text>
    <Text style={styles.body}>이용요금은 무료예요. 동의하지 않아도 현재 위치를 쓰지 않는 지도·장소 탐색은 가능해요.</Text>
    <Text style={styles.body}>현재 위치 이용: {state.status==='active' ? '사용 중' : '중지'} · 방문 기록 저장: {state.historyAllowed ? '켜짐' : '꺼짐'}</Text>
    {state.error && <Text style={styles.body}>{state.error}</Text>}
    {editing && <>
      <Text style={styles.heading}>동의 범위 선택</Text>
      <Text style={styles.body}>현재 위치는 지도 표시·주변 정보·길안내에 이용해요. 네이버 지도에 현재 위치가 반영될 수 있어요. 연속 GPS 경로는 모토맵 서버에 저장하지 않아요.</Text>
      {check('만 14세 이상입니다.',age,() => setAge(!age))}
      {check(`${LEGAL_DOCS.location.title}을 확인하고 위치 이용에 동의해요.`,agreed,() => setAgreed(!agreed))}
      {button(showTerms ? '위치 이용약관 접기' : '위치기반서비스 이용약관 보기',() => setShowTerms(!showTerms))}
      {showTerms && <Text style={styles.body}>{LEGAL_DOCS.location.content}</Text>}
      <Text style={styles.body}>아래는 선택사항이에요. 선택하지 않은 공급자의 위치 기능은 호출하지 않아요. 설정에서 범위를 바꾸거나 전부 중지할 수 있어요.</Text>
      {PROVIDERS.map((provider) => <View key={provider}>
        {check(`${RECIPIENT_LABELS[provider]} 위치 이용·전달 (선택)`,providers.includes(provider),() => setProviders((old) => old.includes(provider) ? old.filter((p) => p!==provider) : [...old,provider]))}
        <Text style={styles.body}>{PROVIDER_DETAILS[provider]}</Text>
      </View>)}
      {state.actor && <>
        {check('새 방문·완주 기록 저장 및 보유 (선택)',history,() => setHistory(!history))}
        <Text style={styles.body}>도착지·등록 경유지·시각·바이크 정보는 삭제 또는 철회할 때까지 보관해요. 기존 기록 {state.historyCount}건은 임의로 삭제하지 않아요. 보유 동의를 철회하려면 아래 ‘방문 기록 동의 철회’를 선택해 주세요.</Text>
      </>}
      {button('선택한 범위에 동의하고 시작하기',() => { void run(async () => {
        await state.consent(age,agreed,history,providers); setEditing(false);
      }); },!age || !agreed)}
      {intro && button('현재 위치 없이 둘러보기',() => state.browse())}
      {button('다시 확인하기',() => { void state.load(state.actor); })}
    </>}
    {(!intro || !!state.actor || state.status!=='unknown') && <>
      {button('동의 범위 변경',beginConsent)}
      {button(state.status==='active' ? '위치 이용 일시 중지' : '위치 이용 다시 시작',() => { void run(async () => {
        await state.change(state.status==='active' ? 'pause' : 'resume');
      }); },state.status==='unknown' || state.status==='withdrawn')}
      <Text style={styles.body}>일시 중지는 기존 자료를 지우지 않아요. 현재 위치 구독과 진행 중 길안내를 멈추고 새로운 위치 이용·전달을 막아요.</Text>
      {button('위치 동의 전부 철회',() => confirm('위치 동의를 철회할까요?',
        '현재 위치 이용·길안내를 멈추고 방문·완주 기록 및 위치 이용·제공 확인자료를 삭제해요. 리뷰·즐겨찾기는 유지돼요. 삭제 자료는 복구할 수 없어요.',async () => {
          await state.change('withdraw'); setEvents([]); setRides([]); beginConsent();
        }))}
      {state.actor && button('방문 기록 동의 철회',() => confirm('방문 기록 보유 동의를 철회할까요?',
        '기존 방문·완주 기록과 관련 확인자료를 삭제하고 새 기록 저장을 꺼요. 지도·길안내 및 리뷰·즐겨찾기는 유지돼요.',async () => {
          await state.change('withdraw_history'); setRides([]); await loadEvents();
        }))}
      <Text style={styles.heading}>위치 이용·제공 확인자료</Text>
      <Text style={styles.body}>처리 시각·목적·공급자·결과만 6개월 보관한 후 매일 정리해요. 원시 GPS 좌표·주소·검색어는 이 자료에 저장하지 않아요. 철회 시 해당 자료는 기간 전이라도 삭제해요.</Text>
      {button('확인자료 열람',() => { void run(() => loadEvents()); })}
      {loadedEvents && !events.length && <Text style={styles.body}>보관 중인 확인자료가 없어요.</Text>}
      {events.map((e) => <View key={e.id} style={styles.card}>
        <Text style={styles.label}>{PURPOSE_LABELS[e.purpose]} · {RECIPIENT_LABELS[e.recipient]}</Text>
        <Text style={styles.body}>{new Date(e.created_at).toLocaleString('ko-KR')} · {e.outcome==='completed' ? '요청 응답 수신(서비스 성공 여부 아님)' : e.outcome==='failed' ? '요청 실패·중지' : '요청됨·결과 미확인'}</Text>
        {button('이 자료 정정 요청',() => requestCorrection(e.id))}
      </View>)}
      {!!events.length && button('확인자료 더 보기',() => { void run(() => loadEvents(true)); })}
      {!!events.length && button('조회한 확인자료 내보내기',() => { void run(async () => { await Share.share({ message: JSON.stringify(events,null,2) }); }); })}
      {state.actor && <>
        <Text style={styles.heading}>내 방문·완주 기록</Text>
        <Text style={styles.body}>집·회사 통계 제외 기록도 여기서 열람·삭제할 수 있어요. 정정은 본인 확인 후 문의로 처리해요.</Text>
        {button('기록 열람',() => { void run(() => loadRides()); })}
        {loadedRides && !rides.length && <Text style={styles.body}>보관 중인 기록이 없어요.</Text>}
        {rides.map((r) => <View key={r.id} style={styles.card}>
          <Text style={styles.label}>{r.name}</Text><Text style={styles.body}>{new Date(r.created_at).toLocaleString('ko-KR')}</Text>
          {!!r.address && <Text style={styles.body}>{r.address}</Text>}
          {r.latitude!==null && r.longitude!==null && <Text style={styles.body}>좌표: {r.latitude}, {r.longitude}</Text>}
          {!!r.bike_model && <Text style={styles.body}>{r.bike_model}</Text>}
          {button('정정 요청',() => requestCorrection(r.id))}
          {button('이 기록 삭제',() => confirm('이 기록을 삭제할까요?','복구할 수 없어요. 리뷰·즐겨찾기는 유지돼요.',async () => {
            await state.change('delete_ride',r.id,r.kind); await loadRides();
          }))}
        </View>)}
        {!!rides.length && button('기록 더 보기',() => { void run(() => loadRides(true)); })}
        {button('방문·완주 기록 전체 삭제',() => confirm('방문·완주 기록을 모두 삭제할까요?',
          '복구할 수 없어요. 리뷰·즐겨찾기와 현재 위치 이용 선택은 유지돼요.',async () => { await state.change('delete_history'); setRides([]); }))}
      </>}
      {button('열람·정정·삭제 문의',() => requestCorrection('위치정보 자료'))}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
  </ScrollView></PostHogMaskView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' }, content: { padding: 24, paddingTop: 48, paddingBottom: 48, gap: 14 },
  title: { fontSize: 25, color: '#F5F5F2', fontWeight: '700' }, heading: { fontSize: 18, color: '#F5F5F2', fontWeight: '700', marginTop: 16 },
  label: { color: '#F5F5F2', fontSize: 15, lineHeight: 23 }, body: { color: '#C4C5C8', fontSize: 14, lineHeight: 22 },
  button: { minHeight: 48, padding: 12, backgroundColor: '#222225', borderRadius: 10, justifyContent: 'center' },
  check: { minHeight: 48, justifyContent: 'center' }, disabled: { opacity: 0.45 }, card: { padding: 14, gap: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12 },
});

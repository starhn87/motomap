import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View, Share } from 'react-native';
import { PostHogMaskView } from 'posthog-react-native';
import LegalConsentScreen from '@/components/auth/LegalConsentScreen';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { locationPrivacyRpc, privacyObject, PURPOSE_LABELS, RECIPIENT_LABELS, LOCATION_CONSENT_VERSION,
  type LocationUsageEvent, type LocationRideRecord } from '@/lib/locationPrivacy';
import { LEGAL_OPERATOR } from '@/constants/legal';
import type { Json } from '@/lib/database.types';

function listFrom<T>(value: Json, key: string, valid: (item: Record<string, Json | undefined>) => boolean): T[] {
  const values = privacyObject(value)[key];
  if (!Array.isArray(values)) throw new Error('자료를 확인하지 못했어요.');
  return values.map(item => { const row = privacyObject(item);
    if (!valid(row)) throw new Error('자료를 확인하지 못했어요.'); return row as T; });
}
export default function LocationPrivacyPanel() {
  const state = useLocationPrivacyStore();
  const [view, setView] = useState<'overview' | 'consent' | 'records'>('overview');
  const [recordType, setRecordType] = useState<'visits' | 'usage' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<LocationUsageEvent[]>([]);
  const [rides, setRides] = useState<LocationRideRecord[]>([]);
  const [loadedEvents, setLoadedEvents] = useState(false);
  const [loadedRides, setLoadedRides] = useState(false);
  const running = useRef(false);

  async function run(work: () => Promise<void>) {
    if (running.current) return;
    if (state.actor !== useLocationPrivacyStore.getState().actor || state.actor !== (useAuthStore.getState().session?.user.id ?? null)) return;
    running.current = true;
    setBusy(true); setError('');
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했어요. 다시 시도해 주세요.'); }
    finally { running.current = false; setBusy(false); }
  }
  function confirm(title: string, message: string, work: () => Promise<void>) {
    Alert.alert(title,message,[{text:'취소',style:'cancel'},
      {text:'확인',style:'destructive',onPress:()=>{void run(work);}}]);
  }
  async function loadEvents(more = false) {
    const requestState = useLocationPrivacyStore.getState();
    if (requestState.actor !== state.actor || requestState.secret !== state.secret) return;
    const value = await locationPrivacyRpc('events', requestState.secret,
      more && events.length ? { before: events[events.length - 1].created_at, beforeId: events[events.length - 1].id } : {}, requestState.actor);
    const current = useLocationPrivacyStore.getState();
    if (requestState.actor !== current.actor || requestState.revision !== current.revision
      || requestState.actor !== (useAuthStore.getState().session?.user.id ?? null)) return;
    const rows = listFrom<LocationUsageEvent>(value,'events',r => typeof r.id==='string' && typeof r.created_at==='string'
      && typeof r.purpose==='string' && Object.hasOwn(PURPOSE_LABELS,r.purpose) && typeof r.recipient==='string'
      && Object.hasOwn(RECIPIENT_LABELS,r.recipient) && ['requested','completed','failed'].includes(String(r.outcome)));
    setEvents(old => more ? [...old,...rows] : rows); setLoadedEvents(true);
  }
  async function loadRides(more = false) {
    const requestState = useLocationPrivacyStore.getState();
    if (requestState.actor !== state.actor || requestState.secret !== state.secret) return;
    const value = await locationPrivacyRpc('rides', requestState.secret,
      more && rides.length ? { before: rides[rides.length - 1].created_at, beforeId: rides[rides.length - 1].id } : {}, requestState.actor);
    const current = useLocationPrivacyStore.getState();
    if (requestState.actor !== current.actor || requestState.revision !== current.revision
      || requestState.actor !== (useAuthStore.getState().session?.user.id ?? null)) return;
    const rows = listFrom<LocationRideRecord>(value,'rides',r => typeof r.id==='string' && typeof r.name==='string'
      && typeof r.created_at==='string' && ['visit','completion'].includes(String(r.kind)));
    setRides(old => more ? [...old,...rows] : rows); setLoadedRides(true);
  }
  function requestCorrection(id: string) {
    void run(async () => { await Linking.openURL(`mailto:${LEGAL_OPERATOR.contactEmail}?subject=${encodeURIComponent('위치정보 열람·정정 요청')}&body=${encodeURIComponent(`대상 자료: ${id}\n요청 내용:\n\n비밀번호나 인증 코드는 보내지 마세요.`)}`); });
  }
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button"
    accessibilityState={{disabled:busy || disabled}} disabled={busy || disabled} onPress={onPress}
    style={({pressed})=>[styles.button,(busy || disabled || pressed) && styles.disabled]}><Text style={styles.label}>{label}</Text></Pressable>;

  if (view==='consent') return <PostHogMaskView style={styles.screen}>
    {button('위치정보 관리로 돌아가기',()=>setView('overview'))}
    <LegalConsentScreen needsLegal={false} showProvidersInline onComplete={()=>setView('overview')} />
  </PostHogMaskView>;
  const active = state.status==='active' && state.version===LOCATION_CONSENT_VERSION;
  return <PostHogMaskView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>{view==='overview' ? '위치정보 관리' : '내 기록 열람·삭제'}</Text>
    {view==='overview' ? <>
      <View style={styles.setting}>
        <View style={styles.settingText}><Text style={styles.label}>현재 위치 사용</Text>
          <Text style={styles.body}>끄면 위치 이용과 길안내를 중지해요.</Text></View>
        <Switch accessibilityLabel="현재 위치 사용" value={active} disabled={busy || !state.ready}
          onValueChange={value=>{ if(value && (state.status==='unknown' || state.status==='withdrawn')) setView('consent');
            else void run(()=>state.change(value ? 'resume' : 'pause')); }} />
      </View>
      {state.actor && <View style={styles.setting}>
        <View style={styles.settingText}><Text style={styles.label}>방문 기록 저장</Text>
          <Text style={styles.body}>도착 장소·시각·바이크 정보를 기록해요. 꺼도 기존 기록은 유지돼요.</Text></View>
        <Switch accessibilityLabel="방문 기록 저장" value={state.historyAllowed} disabled={busy || !active}
          onValueChange={value=>{void run(()=>state.setHistoryAllowed(value));}} />
      </View>}
      {button(active || state.status==='paused' ? '동의 범위 변경' : '위치정보 이용 동의',()=>setView('consent'))}
      {button('내 기록 열람·삭제',()=>{setView('records'); setRecordType(null);})}
      {button('위치정보 동의 철회',()=>confirm('위치정보 동의를 철회할까요?',
        '위치 이용·길안내를 중지하고 방문·완주 기록 및 이용·제공 내역을 삭제해요. 리뷰·즐겨찾기는 유지돼요. 삭제 자료는 복구할 수 없어요.',async()=>{
          await state.change('withdraw'); setEvents([]); setRides([]);
        }))}
    </> : <>
      {button('위치정보 관리로 돌아가기',()=>setView('overview'))}
      <View style={styles.recordTabs}>
        {state.actor && button('방문 기록',()=>{setRecordType('visits'); void run(()=>loadRides());})}
        {button('이용·제공 내역',()=>{setRecordType('usage'); void run(()=>loadEvents());})}
      </View>
      {recordType==='usage' && <>
        <Text style={styles.body}>처리 시각·목적·공급자·결과만 6개월 보관 후 정리해요. GPS 좌표·주소·검색어는 이 내역에 저장하지 않아요.</Text>
        {loadedEvents && !events.length && <Text style={styles.body}>보관 중인 내역이 없어요.</Text>}
        {events.map(e=><View key={e.id} style={styles.card}>
          <Text style={styles.label}>{PURPOSE_LABELS[e.purpose]} · {RECIPIENT_LABELS[e.recipient]}</Text>
          <Text style={styles.body}>{new Date(e.created_at).toLocaleString('ko-KR')} · {e.outcome==='completed'
            ? '요청 응답 수신(서비스 성공 여부 아님)' : e.outcome==='failed' ? '요청 실패·중지' : '요청됨·결과 미확인'}</Text>
          {button('이 내역 정정 요청',()=>requestCorrection(e.id))}
        </View>)}
        {!!events.length && button('내역 더 보기',()=>{void run(()=>loadEvents(true));})}
        {!!events.length && button('조회한 내역 내보내기',()=>{void run(async()=>{await Share.share({message:JSON.stringify(events,null,2)});});})}
      </>}
      {recordType==='visits' && <>
        <Text style={styles.body}>집·회사 통계 제외 기록도 열람·삭제할 수 있어요.</Text>
        {loadedRides && !rides.length && <Text style={styles.body}>보관 중인 기록이 없어요.</Text>}
        {rides.map(r=><View key={r.id} style={styles.card}>
          <Text style={styles.label}>{r.name}</Text><Text style={styles.body}>{new Date(r.created_at).toLocaleString('ko-KR')}</Text>
          {!!r.address && <Text style={styles.body}>{r.address}</Text>}
          {r.latitude!==null && r.longitude!==null && <Text style={styles.body}>좌표: {r.latitude}, {r.longitude}</Text>}
          {!!r.bike_model && <Text style={styles.body}>{r.bike_model}</Text>}
          {button('정정 요청',()=>requestCorrection(r.id))}
          {button('이 기록 삭제',()=>confirm('이 기록을 삭제할까요?','복구할 수 없어요. 리뷰·즐겨찾기는 유지돼요.',async()=>{
            await state.change('delete_ride',r.id,r.kind); await loadRides();
          }))}
        </View>)}
        {!!rides.length && button('기록 더 보기',()=>{void run(()=>loadRides(true));})}
        {button('방문·완주 기록 전체 삭제',()=>confirm('방문·완주 기록을 모두 삭제할까요?',
          '복구할 수 없어요. 리뷰·즐겨찾기와 현재 위치 이용 선택은 유지돼요.',async()=>{await state.change('delete_history'); setRides([]);}))}
        {button('방문 기록 보유 동의 철회',()=>confirm('방문 기록 보유 동의를 철회할까요?',
          '기존 방문·완주 기록과 관련 내역을 삭제하고 새 저장을 꺼요. 지도·길안내와 리뷰·즐겨찾기는 유지돼요.',async()=>{
            await state.change('withdraw_history'); setRides([]); setEvents([]);
          }))}
      </>}
      {button('열람·정정·삭제 문의',()=>requestCorrection('위치정보 자료'))}
    </>}
    {!!state.error && <Text style={styles.body}>{state.error}</Text>}
    {!state.ready && button('다시 확인하기',()=>{void state.load(state.actor);})}
    {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
  </ScrollView></PostHogMaskView>;
}
const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#0A0A0A'},content:{padding:24,paddingBottom:48,gap:16},
  title:{fontSize:23,color:'#F5F5F2',fontWeight:'700'},label:{color:'#F5F5F2',fontSize:15,lineHeight:23},
  body:{color:'#C4C5C8',fontSize:14,lineHeight:22},button:{minHeight:48,padding:12,backgroundColor:'#222225',borderRadius:10,justifyContent:'center'},
  disabled:{opacity:0.45},card:{padding:14,gap:8,borderWidth:1,borderColor:'#333',borderRadius:12},
  setting:{flexDirection:'row',alignItems:'center',gap:16,paddingVertical:12},settingText:{flex:1,gap:6},recordTabs:{gap:8},
});

import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { deviceLocationSecret, loadLocationStopIntent, saveLocationStopIntent, LOCATION_CONSENT_VERSION, locationPrivacyRpc, parseLocationPrivacy, privacyObject,
  type LocationPrivacyState, type LocationPurpose, type LocationRecipient } from '@/lib/locationPrivacy';
import { useMapStore } from '@/stores/useMapStore';
import { useGuideSession } from '@/lib/guideSession';
import KakaoNavi, { supportsKakaoNaviFeature } from '@/modules/kakao-navi';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';
import { PURPOSE_LABELS, RECIPIENT_LABELS } from '@/lib/locationPrivacy';
import { queryClient } from '@/lib/queryClient';

interface PrivacyStore extends LocationPrivacyState {
  ready: boolean; browsing: boolean; secret: string; actor: string | null; error: string | null; revision: number;
  load: (actor: string | null) => Promise<void>;
  consent: (ageConfirmed: boolean, locationAgreed: boolean, historyAgreed: boolean, providers: LocationRecipient[]) => Promise<void>;
  change: (action: 'pause' | 'resume' | 'withdraw' | 'withdraw_history' | 'delete_history' | 'delete_ride', id?: string, kind?: string) => Promise<void>;
  browse: () => void;
}
let loadRevision = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(work);
  mutationQueue = result.catch(() => {});
  return result;
}
async function stopLocationProcessing(): Promise<void> {
  useMapStore.setState({ userLocation: null, mapCenter: null });
  useGuideSession.getState().clear();
  queryClient.clear();
  if (supportsKakaoNaviFeature('location_privacy_stop')) await KakaoNavi.stopLocationUse();
}
function assertActor(actor: string | null): void {
  if (actor !== (useAuthStore.getState().session?.user.id ?? null)) throw new Error('계정이 변경됐어요. 다시 확인해 주세요.');
}
export const useLocationPrivacyStore = create<PrivacyStore>((set, get) => ({
  status: 'unknown', version: null, historyAllowed: false, historyCount: 0,
  providers: [],
  ready: false, browsing: false, secret: '', actor: null, error: null, revision: 0,
  load: async (actor) => {
    const revision = ++loadRevision;
    set({ ready: false, actor, status: 'unknown', historyAllowed: false, providers: [], browsing: false, error: null,
      revision: get().revision + 1 });
    try {
      await stopLocationProcessing();
      assertActor(actor);
      const secret = await deviceLocationSecret();
      const result = parseLocationPrivacy(await locationPrivacyRpc('status', secret, {}, actor));
      const intent = await loadLocationStopIntent(actor);
      if (revision !== loadRevision) return;
      set({ ...result, secret, ready: true,
        ...(intent ? { historyAllowed: false,
          status: intent==='withdraw' ? 'withdrawn' as const : 'paused' as const,
          error: '이전 중지·철회 요청이 아직 서버에서 확인되지 않았어요. 다시 요청하거나 명시적으로 동의 범위를 확인해 주세요.' } : {}) });
    } catch {
      if (revision === loadRevision) set({ error: '위치정보 설정을 불러오지 못했어요. 위치 없이 둘러보거나 다시 확인해 주세요.' });
    }
  },
  consent: async (ageConfirmed, locationAgreed, historyAgreed, providers) => {
    const before = get();
    const generation = ++loadRevision;
    set({ status: 'paused', historyAllowed: false, revision: before.revision + 1 });
    const stopping = stopLocationProcessing();
    void stopping.catch(() => {});
    await serialize(async () => {
      let intent;
      try {
        intent = await loadLocationStopIntent(before.actor);
        if (!intent) await saveLocationStopIntent(before.actor,'pause');
      } finally { await stopping; }
      if (generation !== loadRevision) throw new Error('위치정보 설정이 변경됐어요. 다시 확인해 주세요.');
      assertActor(before.actor);
      const secret = before.secret || await deviceLocationSecret();
      if (intent==='withdraw' || intent==='withdraw_history')
        await locationPrivacyRpc(intent,secret,{},before.actor);
      const result = parseLocationPrivacy(await locationPrivacyRpc('consent', secret, {
        version: LOCATION_CONSENT_VERSION, ageConfirmed, locationAgreed, historyAgreed, providers,
      }, before.actor));
      if (generation !== loadRevision) return;
      assertActor(before.actor);
      await saveLocationStopIntent(before.actor,null);
      if (generation !== loadRevision) return;
      set({ ...result, secret, ready: true, browsing: true, error: null, revision: get().revision + 1 });
    });
  },
  change: async (action, id, kind) => {
    const before = get();
    const generation = ++loadRevision;
    set({ revision: before.revision + 1 });
    // 일시 중지·철회는 네트워크 응답 전부터 닫는다. 실패해도 자동으로 다시 켜지 않는다.
    if (action === 'pause' || action === 'withdraw') {
      set({ status: 'paused', revision: before.revision + 1 });
      useMapStore.setState({ userLocation: null, mapCenter: null });
      useGuideSession.getState().clear();
    }
    if (action === 'withdraw_history') set({ historyAllowed: false });
    const persist = ['pause','withdraw','withdraw_history'].includes(action)
      ? saveLocationStopIntent(before.actor,action as 'pause' | 'withdraw' | 'withdraw_history') : Promise.resolve();
    // 앞선 요청을 기다리는 동안 저장 오류가 전역 rejection으로 새지 않게 한다.
    void persist.catch(() => {});
    const mustStop = action==='pause' || action==='withdraw' || before.status==='paused' || before.status==='withdrawn';
    const stopping = mustStop ? stopLocationProcessing() : Promise.resolve();
    void stopping.catch(() => {});
    await serialize(async () => {
      let intent;
      try {
        await persist;
        intent = await loadLocationStopIntent(before.actor);
      } finally { await stopping; }
      if (!mustStop && (intent==='pause' || intent==='withdraw')) await stopLocationProcessing();
      if (generation !== loadRevision) throw new Error('위치정보 설정이 변경됐어요. 다시 확인해 주세요.');
      assertActor(before.actor);
      if (action==='resume' && intent==='withdraw')
        throw new Error('이전 철회를 완료한 뒤 새롭게 동의해 주세요.');
      // 기존 철회가 미완료이면 약한 설정·삭제·재시작보다 파기를 먼저 끝낸다.
      let result;
      if ((intent==='withdraw' || intent==='withdraw_history') && action!==intent && action!=='withdraw')
        result = parseLocationPrivacy(await locationPrivacyRpc(intent,before.secret,{},before.actor));
      if (!(intent==='withdraw' && action==='pause'))
        result = parseLocationPrivacy(await locationPrivacyRpc(action, before.secret, id ? { id, kind: kind ?? 'visit' } : {}, before.actor));
      if (!result) throw new Error('위치정보 응답을 확인하지 못했어요.');
      if (before.status==='paused' && result.status==='active' && action!=='resume')
        result = parseLocationPrivacy(await locationPrivacyRpc('pause',before.secret,{},before.actor));
      if (generation !== loadRevision) return;
      assertActor(before.actor);
      if (['withdraw','withdraw_history','delete_history','delete_ride'].includes(action)) queryClient.clear();
      if (intent || ['pause','withdraw','withdraw_history','resume'].includes(action)) await saveLocationStopIntent(before.actor,null);
      if (generation !== loadRevision) return;
      set({ ...result, revision: get().revision + 1, error: null });
    });
  },
  browse: () => {
    ++loadRevision;
    set({ ready: true, browsing: true, status: 'paused', historyAllowed: false, revision: get().revision + 1 });
    useMapStore.setState({ userLocation: null, mapCenter: null });
  },
}));

export function locationUseAllowed(): boolean {
  const state = useLocationPrivacyStore.getState();
  const auth = useAuthStore.getState();
  return state.ready && state.status === 'active' && state.version === LOCATION_CONSENT_VERSION
    && (auth.status==='signed_in' || auth.status==='signed_out') && state.actor===(auth.session?.user.id ?? null);
}
export function requireLocationUse(): void {
  if (!locationUseAllowed()) throw new Error('설정의 ‘위치정보’에서 이용에 동의하고 다시 시작해 주세요.');
}
export function providerLocationAllowed(recipient: LocationRecipient): boolean {
  return locationUseAllowed() && (['device','motomap'].includes(recipient) || useLocationPrivacyStore.getState().providers.includes(recipient));
}

// GPS 점별이 아니라 기능 이용 단위다. 좌표·검색어·목적지는 확인자료에 넣지 않는다.
export async function withLocationUse<T>(purpose: LocationPurpose, recipient: LocationRecipient, work: () => Promise<T>): Promise<T> {
  requireLocationUse();
  const state = useLocationPrivacyStore.getState();
  if (!['device','motomap'].includes(recipient) && !state.providers.includes(recipient))
    throw new Error(`${RECIPIENT_LABELS[recipient]} 위치 이용은 설정의 ‘위치정보’에서 선택해 주세요.`);
  const id = Crypto.randomUUID();
  const receipt = privacyObject(await locationPrivacyRpc('record', state.secret, { id, purpose, recipient }, state.actor));
  if (receipt.id!==id || typeof receipt.createdAt!=='string' || !Number.isFinite(Date.parse(receipt.createdAt)))
    throw new Error('위치 이용 확인자료를 기록하지 못했어요.');
  if (state.revision !== useLocationPrivacyStore.getState().revision) throw new Error('위치정보 이용이 중지됐어요.');
  let outcome: 'completed' | 'failed' = 'failed';
  let result!: T;
  try {
    requireLocationUse();
    if (!['device','motomap'].includes(recipient)) {
      const message = `${RECIPIENT_LABELS[recipient]} · ${PURPOSE_LABELS[purpose]} · ${new Date(receipt.createdAt).toLocaleString('ko-KR')}`;
      if (useGuideSession.getState().goal) await KakaoNavi.showGuideNotice(`위치정보 전달 요청: ${message}`);
      else toast.info('위치정보 전달 요청', message);
      requireLocationUse();
      if (state.revision !== useLocationPrivacyStore.getState().revision) throw new Error('위치정보 이용이 중지됐어요.');
    }
    result = await work();
    if (state.revision !== useLocationPrivacyStore.getState().revision) throw new Error('위치정보 이용이 중지됐어요.');
    outcome = 'completed';
  } finally {
    // 철회 후 삭제한 이력을 다시 만들지 않고 기존 결과 갱신만 시도한다.
    await locationPrivacyRpc('complete', state.secret, { id, outcome }, state.actor).catch(() => {
      // requested는 성공이 아니라 결과 미확인으로 표시한다. 오류·좌표는 분석에 보내지 않는다.
    });
  }
  requireLocationUse();
  if (state.revision !== useLocationPrivacyStore.getState().revision) throw new Error('위치정보 이용이 중지됐어요.');
  return result;
}

/** 외부 좌표 서비스는 동의 후 이용한다. 위치 비사용 검색은 좌표 편향 없이 처리한다. */
export async function withCoordinateUse<T>(point: { latitude: number; longitude: number }, purpose: LocationPurpose,
  recipient: LocationRecipient, work: () => Promise<T>): Promise<T> {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) throw new Error('위치를 확인하지 못했어요.');
  return withLocationUse(purpose, recipient, work);
}

import * as Crypto from 'expo-crypto';
import { authStorage } from '@/lib/authStorage';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';

export const LOCATION_CONSENT_VERSION = '2026-10-11-location-v2';
const DEVICE_KEY = 'motomap-location-subject-v1';
export type LocationStopIntent = 'pause' | 'withdraw' | 'withdraw_history';
let intentQueue: Promise<unknown> = Promise.resolve();
function intentStorage<T>(work: () => Promise<T>): Promise<T> {
  const operation = intentQueue.then(work);
  intentQueue = operation.catch(() => {});
  return operation;
}
export function loadLocationStopIntent(actor: string | null): Promise<LocationStopIntent | null> {
  return intentStorage(async () => {
    const value = await authStorage.getItem(`location-stop-v1-${actor ?? 'guest'}`);
    if (value === null) return null;
    if (!['pause','withdraw','withdraw_history'].includes(value)) throw new Error('위치 중지 설정을 확인하지 못했어요.');
    return value as LocationStopIntent;
  });
}
export function saveLocationStopIntent(actor: string | null, intent: LocationStopIntent | null): Promise<void> {
  return intentStorage(async () => {
    const key = `location-stop-v1-${actor ?? 'guest'}`;
    if (intent === null) await authStorage.removeItem(key);
    else {
      const previous = await authStorage.getItem(key);
      // 미완료 파기 요청은 약한 중지 요청으로 덮지 않는다.
      const strongest = previous === 'withdraw' || (previous === 'withdraw_history' && intent === 'pause')
        ? previous : intent;
      await authStorage.setItem(key,strongest);
    }
  });
}
export type LocationPurpose = 'map' | 'search' | 'address' | 'weather' | 'gas' | 'route' | 'navigation' | 'ai' | 'arrival';
export type LocationRecipient = 'device' | 'motomap' | 'naver' | 'kakao' | 'kma' | 'airkorea' | 'opinet' | 'anthropic';
export type LocationPrivacyStatus = 'unknown' | 'active' | 'paused' | 'withdrawn';
export interface LocationPrivacyState {
  status: LocationPrivacyStatus;
  version: string | null;
  historyAllowed: boolean;
  historyCount: number;
  providers: LocationRecipient[];
}
export interface LocationUsageEvent {
  id: string; purpose: LocationPurpose; recipient: LocationRecipient;
  outcome: 'requested' | 'completed' | 'failed'; created_at: string;
}
export interface LocationRideRecord {
  id: string; kind: 'visit' | 'completion'; name: string; created_at: string; role: string;
  excluded_from_place_stats: boolean; address: string | null; latitude: number | null; longitude: number | null; bike_model: string | null;
}

let secretPromise: Promise<string> | null = null;
export function deviceLocationSecret(): Promise<string> {
  if (!secretPromise) secretPromise = (async () => {
    const saved = await authStorage.getItem(DEVICE_KEY);
    if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved;
    const bytes = await Crypto.getRandomBytesAsync(32);
    const secret = Array.from(bytes,(byte) => byte.toString(16).padStart(2,'0')).join('');
    await authStorage.setItem(DEVICE_KEY, secret);
    return secret;
  })().catch((error) => { secretPromise=null; throw error; });
  return secretPromise;
}

// 비밀값은 분석·오류 로그에 넣지 않는다. 원격 실패를 성공/동의로 바꾸지 않는다.
export async function locationPrivacyRpc(action: string, secret: string, payload: Record<string, Json | undefined>, actor: string | null): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const { data, error } = await supabase.rpc('location_privacy', {
      p_action: action, p_secret: secret, p_payload: { ...payload, expectedActor: actor },
    }).abortSignal(controller.signal);
    if (error) throw new Error('위치정보 설정을 처리하지 못했어요. 다시 시도해 주세요.');
    if (data === null) throw new Error('위치정보 응답을 확인하지 못했어요.');
    return data;
  } finally { clearTimeout(timer); }
}

export function privacyObject(value: Json): Record<string, Json | undefined> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('잘못된 위치정보 응답입니다.');
  return value;
}
export function parseLocationPrivacy(value: Json): LocationPrivacyState {
  const v = privacyObject(value);
  if (!['unknown','active','paused','withdrawn'].includes(String(v.status)) || typeof v.historyAllowed !== 'boolean'
    || typeof v.historyCount !== 'number' || !Number.isSafeInteger(v.historyCount) || v.historyCount < 0
    || (v.version !== null && typeof v.version !== 'string')) throw new Error('위치정보 설정을 확인하지 못했어요.');
  if (!Array.isArray(v.providers) || v.providers.some((p) => typeof p !== 'string' || !['naver','kakao','kma','airkorea','opinet','anthropic'].includes(p)))
    throw new Error('위치 제공 범위를 확인하지 못했어요.');
  return { status: v.status as LocationPrivacyStatus, version: v.version as string | null,
    historyAllowed: v.historyAllowed, historyCount: v.historyCount, providers: v.providers as LocationRecipient[] };
}

export const PURPOSE_LABELS: Record<LocationPurpose, string> = {
  map: '현재 위치 표시', search: '주변 장소 검색', address: '주소 확인', weather: '날씨 확인',
  gas: '주변 유가 확인', route: '경로 탐색', navigation: '길안내', ai: 'AI 추천', arrival: '방문·완주 기록',
};
export const RECIPIENT_LABELS: Record<LocationRecipient, string> = {
  device: '기기 안에서 처리', motomap: '모토맵', naver: '네이버', kakao: '카카오',
  kma: '기상청', airkorea: '한국환경공단', opinet: '한국석유공사', anthropic: 'Anthropic',
};

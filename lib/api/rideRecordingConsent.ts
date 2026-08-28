import { supabase } from '@/lib/supabase';

export const RIDE_RECORDING_POLICY_VERSION = '2026-08-28';

export interface RideRecordingConsent {
  consentId: string;
  consentedAt: string;
  expiresAt: string;
  policyVersion: string;
}

export async function fetchActiveRideRecordingConsent(): Promise<RideRecordingConsent | null> {
  const { data, error } = await supabase
    .from('ride_recording_consents')
    .select('id,consented_at,expires_at,policy_version')
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('consented_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    consentId: data.id,
    consentedAt: data.consented_at,
    expiresAt: data.expires_at,
    policyVersion: data.policy_version,
  };
}

/** 경로 수집·이용·최대 1년 보관의 별도 동의를 서버에 증적으로 남긴다. */
export async function consentRideRecording(): Promise<RideRecordingConsent> {
  const { data, error } = await supabase.rpc('consent_ride_recording');
  if (error) throw error;
  const consent = data?.[0];
  if (!consent) throw new Error('라이딩 경로 기록 동의를 저장하지 못했습니다.');
  return {
    consentId: consent.consent_id,
    consentedAt: consent.consented_at,
    expiresAt: consent.expires_at,
    policyVersion: RIDE_RECORDING_POLICY_VERSION,
  };
}

/** 동의를 철회하며 서버의 경로 기록도 같은 트랜잭션에서 모두 삭제한다. */
export async function revokeRideRecordingConsent(): Promise<void> {
  const { error } = await supabase.rpc('revoke_ride_recording_consent');
  if (error) throw error;
}

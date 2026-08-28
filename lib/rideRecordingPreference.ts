import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  RIDE_RECORDING_POLICY_VERSION,
  type RideRecordingConsent,
} from '@/lib/api/rideRecordingConsent';

const RIDE_RECORDING_KEY = 'ride-recording-enabled:v1';

export interface RideRecordingPreference extends RideRecordingConsent {
  enabled: boolean;
}

function keyForUser(userId: string): string {
  return `${RIDE_RECORDING_KEY}:${userId}`;
}

export async function isRideRecordingEnabled(userId: string): Promise<boolean> {
  const preference = await getRideRecordingPreference(userId);
  return !!preference
    && preference.enabled
    && preference.policyVersion === RIDE_RECORDING_POLICY_VERSION
    && Date.parse(preference.expiresAt) > Date.now();
}

export async function getRideRecordingPreference(
  userId: string,
): Promise<RideRecordingPreference | null> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));
  if (!raw || raw === 'true' || raw === 'false') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RideRecordingPreference>;
    if (
      typeof parsed.enabled !== 'boolean'
      || typeof parsed.consentId !== 'string'
      || typeof parsed.consentedAt !== 'string'
      || typeof parsed.expiresAt !== 'string'
      || parsed.policyVersion !== RIDE_RECORDING_POLICY_VERSION
      || !Number.isFinite(Date.parse(parsed.consentedAt))
      || !Number.isFinite(Date.parse(parsed.expiresAt))
    ) return null;
    return parsed as RideRecordingPreference;
  } catch {
    return null;
  }
}

export async function setRideRecordingEnabled(
  userId: string,
  enabled: boolean,
  consent?: RideRecordingConsent,
): Promise<void> {
  const current = await getRideRecordingPreference(userId);
  const next = consent ?? current;
  if (enabled && !next) throw new Error('라이딩 경로 기록 동의가 필요합니다.');
  if (!next) {
    await AsyncStorage.removeItem(keyForUser(userId));
    return;
  }
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify({ ...next, enabled }));
}

import { Platform } from 'react-native';

import { APP_STORE_URL } from '@/constants/app';
import releasePolicy from '@/config/release-policy.json';
import { supabase } from '@/lib/supabase';

const BUNDLE_ID = 'com.ridemap.app';
const POLICY_TIMEOUT_MS = 2500;

export interface AppCompatibilityPolicy {
  latestVersion: string;
  recommendedVersion: string;
  minimumSupportedVersion: string;
  updateMessage: string;
  storeUrl: string;
}

/** 숫자 단위 버전 비교. a가 크면 양수다. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

export const LOCAL_COMPATIBILITY_POLICY: AppCompatibilityPolicy = {
  latestVersion: releasePolicy.appVersion,
  recommendedVersion: releasePolicy.appVersion,
  minimumSupportedVersion: releasePolicy.minimumSupportedVersion,
  updateMessage: '더 안정적인 모토맵을 사용하려면 업데이트해 주세요.',
  storeUrl: APP_STORE_URL,
};

type PolicyRow = {
  latest_version?: unknown;
  recommended_version?: unknown;
  minimum_supported_version?: unknown;
  update_message?: unknown;
  store_url?: unknown;
};

function normalizePolicy(row: PolicyRow | null): AppCompatibilityPolicy | null {
  if (
    !row ||
    !isVersion(row.latest_version) ||
    !isVersion(row.recommended_version) ||
    !isVersion(row.minimum_supported_version) ||
    typeof row.update_message !== 'string' ||
    typeof row.store_url !== 'string'
  ) {
    return null;
  }
  if (
    compareVersions(row.minimum_supported_version, row.recommended_version) > 0 ||
    compareVersions(row.recommended_version, row.latest_version) > 0
  ) {
    return null;
  }
  return {
    latestVersion: row.latest_version,
    recommendedVersion: row.recommended_version,
    minimumSupportedVersion: row.minimum_supported_version,
    updateMessage: row.update_message,
    storeUrl: row.store_url,
  };
}

/**
 * 원격 호환성 정책. 실패·지연·잘못된 값은 모두 null로 닫아 앱 진입을 보장한다.
 * 최소 지원 버전은 운영자가 명시적으로 올리기 전에는 강제로 변하지 않는다.
 */
export async function fetchAppCompatibilityPolicy(): Promise<AppCompatibilityPolicy | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = supabase
      .from('app_compatibility_policy')
      .select(
        'latest_version,recommended_version,minimum_supported_version,update_message,store_url',
      )
      .eq('platform', Platform.OS)
      .maybeSingle();
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), POLICY_TIMEOUT_MS);
    });
    const result = await Promise.race([query, timeout]);
    if (!result || result.error) return null;
    return normalizePolicy(result.data as PolicyRow | null);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Apple 공개 조회 API. CDN 지연이나 실패는 업데이트 안내만 늦출 뿐이다. */
export async function fetchStoreVersion(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=kr`,
    );
    if (!res.ok) return null;
    const version: unknown = (await res.json())?.results?.[0]?.version;
    return isVersion(version) ? version : null;
  } catch {
    return null;
  }
}

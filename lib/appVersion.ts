import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import releasePolicy from '@/config/release-policy.json';

export const RELEASE_POLICY = releasePolicy;

/** OTA 번들이 아니라 설치된 네이티브 바이너리의 앱 버전. */
export function getInstalledAppVersion(): string | null {
  // runtimeVersion이 appVersion 정책이라 네이티브 바이너리의 마케팅 버전과 같다.
  return Updates.runtimeVersion ?? Constants.expoConfig?.version ?? null;
}

/** 스토어·Sentry에서 같은 바이너리를 식별하는 빌드 번호. */
export function getNativeBuildNumber(): string | null {
  if (Platform.OS === 'ios') return Constants.platform?.ios?.buildNumber ?? null;
  if (Platform.OS === 'android') {
    const code = Constants.platform?.android?.versionCode;
    return code == null ? null : String(code);
  }
  return null;
}

export interface AppReleaseContext {
  [key: string]: string | number;
  app_version: string;
  build_number: string;
  runtime_version: string;
  update_id: string;
  update_source: 'embedded' | 'ota';
  native_bridge_version: number;
  api_contract_version: number;
}

/** Sentry·PostHog가 같은 기준으로 릴리스를 나누도록 공통 속성을 만든다. */
export function getAppReleaseContext(nativeBridgeVersion: number): AppReleaseContext {
  const appVersion = getInstalledAppVersion() ?? releasePolicy.appVersion;
  return {
    app_version: appVersion,
    build_number: getNativeBuildNumber() ?? 'unknown',
    runtime_version: Updates.runtimeVersion ?? appVersion,
    update_id: Updates.updateId ?? 'embedded',
    update_source: Updates.isEmbeddedLaunch ? 'embedded' : 'ota',
    native_bridge_version: nativeBridgeVersion,
    api_contract_version: releasePolicy.apiContractVersion,
  };
}

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import releaseNotes from '@/config/release-notes.json';
import {
  compareVersions,
  fetchAppCompatibilityPolicy,
  fetchStoreVersion,
  type AppCompatibilityPolicy,
} from '@/lib/appCompatibility';
import { getInstalledAppVersion } from '@/lib/appVersion';
import { appAlert } from '@/lib/dialog';

// 스토어 업데이트 안내 — 새 네이티브 버전이 출시되면 구버전 사용자는 OTA 를
// 더 못 받는다(runtime 분리). 앱 시작 때 App Store 의 최신 버전을 조회해
// 한 번만 안내한다. 조회·안내가 앱 시작을 방해하면 안 되니 실패는 전부 무시.

const APP_STORE_ID = '6773636183';
const STORE_URL = `https://apps.apple.com/kr/app/id${APP_STORE_ID}`;
// 이미 안내한 스토어 버전 — 같은 버전으로 매 실행 조르지 않는다
const PROMPTED_KEY = 'store-update-prompted';
const RELEASE_NOTES_SEEN_PREFIX = 'release-notes-seen:';

// 새 버전을 준비할 때 해당 버전 항목을 함께 추가한다. 버전 키가 정확히 일치할
// 때만 보여서 릴리즈 노트를 빠뜨린 빌드가 이전 공지를 잘못 띄우지 않는다.
const RELEASE_NOTES = releaseNotes as Record<
  string,
  { title: string; body: string[] }
>;

async function promptUpdateOnce(
  version: string,
  message: string,
  storeUrl = STORE_URL,
): Promise<void> {
  if ((await AsyncStorage.getItem(PROMPTED_KEY)) === version) return;
  await AsyncStorage.setItem(PROMPTED_KEY, version);
  appAlert('새로운 업데이트가 있어요', message, [
    { text: '업데이트', onPress: () => void Linking.openURL(storeUrl) },
    { text: '나중에', style: 'cancel' },
  ]);
}

/** 최소 지원 버전은 닫을 수 없는 안내, 권장 버전은 한 번만 알린다. */
async function checkCompatibilityPolicy(
  current: string,
  policy: AppCompatibilityPolicy | null,
): Promise<'blocked' | 'prompted' | 'none'> {
  if (!policy) return 'none';
  if (compareVersions(current, policy.minimumSupportedVersion) < 0) {
    appAlert(
      '업데이트가 필요해요',
      policy.updateMessage,
      [{ text: 'App Store에서 업데이트', onPress: () => void Linking.openURL(policy.storeUrl) }],
      { dismissible: false },
    );
    return 'blocked';
  }
  if (compareVersions(current, policy.recommendedVersion) < 0) {
    await promptUpdateOnce(
      policy.recommendedVersion,
      policy.updateMessage,
      policy.storeUrl,
    );
    return 'prompted';
  }
  return 'none';
}

/** 스토어에 더 새 버전이 있는지 확인하고, 처음 감지했을 때 업데이트를 안내한다. */
async function checkStoreUpdate(): Promise<boolean> {
  if (__DEV__) return false;
  try {
    const current = getInstalledAppVersion();
    if (!current) return false;
    const latest = await fetchStoreVersion();
    if (!latest || compareVersions(latest, current) <= 0) return false;
    await promptUpdateOnce(
      latest,
      `모토맵 ${latest} 버전이 나왔어요. 업데이트하면 새 기능을 바로 쓸 수 있어요.`,
    );
    return true;
  } catch {
    // 네트워크 실패 등 — 다음 실행에 다시 시도된다
    return false;
  }
}

/** 설치된 버전의 새로운 기능을 기기당 한 번만 안내한다. */
async function showReleaseNotesIfNeeded(): Promise<void> {
  if (__DEV__) return;
  try {
    const current = getInstalledAppVersion();
    if (!current) return;
    const release = RELEASE_NOTES[current];
    if (!release) return;
    const seenKey = `${RELEASE_NOTES_SEEN_PREFIX}${current}`;
    if ((await AsyncStorage.getItem(seenKey)) === '1') return;
    await AsyncStorage.setItem(seenKey, '1');
    appAlert(
      release.title,
      release.body.map((line) => `• ${line}`).join('\n'),
    );
  } catch {
    // 저장소 접근 실패가 앱 시작을 막지 않게 한다
  }
}

/** 앱 시작 후 한 번 호출 — 업데이트 안내와 현재 버전 공지가 겹치지 않게 조율한다. */
export async function checkStartupNotices(): Promise<void> {
  if (__DEV__) return;
  const current = getInstalledAppVersion();
  if (current) {
    const compatibility = await checkCompatibilityPolicy(
      current,
      await fetchAppCompatibilityPolicy(),
    );
    if (compatibility !== 'none') return;
  }
  const updateAvailable = await checkStoreUpdate();
  if (!updateAvailable) await showReleaseNotesIfNeeded();
}

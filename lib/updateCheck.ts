import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { appAlert } from '@/lib/dialog';

// 스토어 업데이트 안내 — 새 네이티브 버전이 출시되면 구버전 사용자는 OTA 를
// 더 못 받는다(runtime 분리). 앱 시작 때 App Store 의 최신 버전을 조회해
// 한 번만 안내한다. 조회·안내가 앱 시작을 방해하면 안 되니 실패는 전부 무시.

const APP_STORE_ID = '6773636183';
const STORE_URL = `https://apps.apple.com/kr/app/id${APP_STORE_ID}`;
// 이미 안내한 스토어 버전 — 같은 버전으로 매 실행 조르지 않는다
const PROMPTED_KEY = 'store-update-prompted';

// 설치된 바이너리 버전 — runtime 이 appVersion 정책이라 곧 네이티브 버전이다.
// (expoConfig.version 은 OTA 번들 값이라 폴백으로만 쓴다)
function installedVersion(): string | null {
  return Updates.runtimeVersion ?? Constants.expoConfig?.version ?? null;
}

// '1.2.10' > '1.2.4' 같은 자리수 비교 — 스토어 버전은 semver 세 자리다
function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** 앱 시작 후 1회 호출 — 스토어에 새 버전이 있으면 업데이트 안내를 띄운다 */
export async function checkStoreUpdate() {
  if (__DEV__) return;
  try {
    const current = installedVersion();
    if (!current) return;
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=kr`,
    );
    if (!res.ok) return;
    const latest: string | undefined = (await res.json()).results?.[0]?.version;
    if (!latest || !isNewer(latest, current)) return;
    if ((await AsyncStorage.getItem(PROMPTED_KEY)) === latest) return;
    await AsyncStorage.setItem(PROMPTED_KEY, latest);
    appAlert(
      '새로운 업데이트가 있어요',
      `모토맵 ${latest} 버전이 나왔어요. 업데이트하면 새 기능을 바로 쓸 수 있어요.`,
      [
        { text: '업데이트', onPress: () => void Linking.openURL(STORE_URL) },
        { text: '나중에', style: 'cancel' },
      ],
    );
  } catch {
    // 네트워크 실패 등 — 다음 실행에 다시 시도된다
  }
}

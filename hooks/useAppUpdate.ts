import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { APP_STORE_URL } from '@/constants/app';

const BUNDLE_ID = 'com.ridemap.app';

/**
 * 숫자 단위로 버전을 비교한다. a 가 크면 양수.
 *
 * 문자열 비교로는 "1.2.10" < "1.2.9" 가 되어 열 번째 패치부터 어긋난다.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * App Store 에 올라간 버전. 인증도 SDK 도 필요 없는 Apple 공개 조회 API.
 * 심사가 통과해 출시되면 값이 알아서 바뀐다.
 *
 * Apple CDN 이 값을 몇 시간 물고 있어서 출시 직후엔 옛 버전이 올 수 있다 —
 * 알림이 조금 늦게 뜰 뿐이라 그대로 둔다.
 */
async function fetchStoreVersion(): Promise<string | null> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=kr`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json?.results?.[0]?.version ?? null;
}

/**
 * 스토어에 새 버전이 있는지.
 *
 * 여기서 보는 건 바이너리 버전이다 — OTA 로 JS 가 바뀌어도 이 값은 그대로이고,
 * 스토어 업데이트 판단에는 그게 맞다.
 */
export function useAppUpdate() {
  const current = Constants.expoConfig?.version ?? '0.0.0';

  const { data: storeVersion } = useQuery({
    queryKey: ['store-version'],
    queryFn: fetchStoreVersion,
    // 하루에 몇 번씩 물어볼 이유가 없다
    staleTime: 1000 * 60 * 60 * 6,
    retry: 1,
  });

  // TestFlight 는 스토어보다 버전이 높다 — 그때 업데이트를 권하면 안 된다
  const hasUpdate = !!storeVersion && compareVersions(storeVersion, current) > 0;

  return {
    current,
    storeVersion,
    hasUpdate,
    openStore: () => void Linking.openURL(APP_STORE_URL),
  };
}

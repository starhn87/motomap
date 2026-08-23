import { useQuery } from '@tanstack/react-query';
import { Linking } from 'react-native';

import { APP_STORE_URL } from '@/constants/app';
import { compareVersions, fetchStoreVersion } from '@/lib/appCompatibility';
import { getInstalledAppVersion } from '@/lib/appVersion';

/**
 * 스토어에 새 버전이 있는지.
 *
 * 여기서 보는 건 바이너리 버전이다 — OTA 로 JS 가 바뀌어도 이 값은 그대로이고,
 * 스토어 업데이트 판단에는 그게 맞다.
 */
export function useAppUpdate() {
  const current = getInstalledAppVersion() ?? '0.0.0';

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

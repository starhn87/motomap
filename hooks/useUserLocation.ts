import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import { useMapStore } from '@/stores/useMapStore';
import { useGuideSession } from '@/lib/guideSession';
import { toast } from '@/lib/toast';
import { shouldTrackUserLocation, startUserLocationTracking } from '@/lib/userLocationTracking';
import { useLocationPrivacyStore, locationUseAllowed, withLocationUse } from '@/stores/useLocationPrivacyStore';

/**
 * 포그라운드 위치 권한을 얻어 현재 위치를 추적해 스토어에 반영하고,
 * 기기 heading(방위)을 반환한다. 캐시된 마지막 위치를 먼저 반영해 초기 표시를 앞당긴다.
 *
 * 안내 중에는 전부 멈춘다. 안내 화면은 OverFullScreen 이라 지도 탭이 뷰 계층에
 * 남아 살아 있는데, 그동안 KNSDK 가 자기 GPS 로 주행을 끌고 간다 — 우리 구독은
 * 쓰이지도 않으면서 위치·나침반 콜백마다 리렌더를 일으켜 발열만 보탠다.
 * 특히 heading 은 필터가 없어 주행 중 초당 수십 번 들어온다.
 */
export function useUserLocation(enabled = true, trackHeading = true) {
  const setUserLocation = useMapStore((s) => s.setUserLocation);
  const [heading, setHeading] = useState(0);
  const guiding = useGuideSession((s) => !!s.goal);
  const [appState, setAppState] = useState(AppState.currentState);
  const revision = useLocationPrivacyStore((s) => s.revision);
  const tracking = shouldTrackUserLocation(enabled && locationUseAllowed(), appState, guiding);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    setAppState(AppState.currentState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // 지도 인스턴스·카메라는 보존하되 가려진 지도와 비활성 앱의 센서는 정리한다.
    if (!tracking) return;
    const currentLease = () => locationUseAllowed() && revision === useLocationPrivacyStore.getState().revision;
    const assertLease = () => { if (!currentLease()) throw new Error('위치 이용이 중지됐어요.'); };
    return startUserLocationTracking(
      {
        requestPermission: () => withLocationUse('map', 'naver', () => Location.requestForegroundPermissionsAsync()),
        lastKnown: () => { assertLease(); return Location.getLastKnownPositionAsync(); },
        current: () => { assertLease(); return Location.getCurrentPositionAsync({}); },
        watchPosition: async (callback) => {
          assertLease();
          const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10 }, callback);
          if (!currentLease()) sub.remove();
          return sub;
        },
        watchHeading: async (callback) => {
          assertLease();
          const sub = await Location.watchHeadingAsync(callback);
          if (!currentLease()) sub.remove();
          return sub;
        },
      },
      (coords) => { if (currentLease()) setUserLocation(coords); },
      (value) => { if (currentLease()) setHeading(value); },
      () => {
        if (currentLease()) toast.info('현재 위치를 확인할 수 없습니다.', '위치 서비스와 권한을 확인해주세요.');
      },
      trackHeading,
    );
  }, [setUserLocation, tracking, trackHeading, revision]);

  return { heading };
}

import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { useMapStore } from '@/stores/useMapStore';
import { toast } from '@/lib/toast';

/**
 * 포그라운드 위치 권한을 얻어 현재 위치를 추적해 스토어에 반영하고,
 * 기기 heading(방위)을 반환한다. 캐시된 마지막 위치를 먼저 반영해 초기 표시를 앞당긴다.
 */
export function useUserLocation() {
  const setUserLocation = useMapStore((s) => s.setUserLocation);
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // 캐시된 마지막 위치를 먼저 반영해 초기 지도 위치를 빠르게 내 위치로 맞춘다
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        setUserLocation({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        });
      }

      // 권한이 granted 여도 위치 접근 자체는 실패할 수 있다(위치 서비스 off,
      // iOS 정확한 위치 끔/제한적 권한, 체크~호출 사이 권한 취소 race 등).
      // 초기 위치는 위 lastKnown 으로 이미 반영했으므로, 실패해도 unhandled
      // rejection 으로 새지 않게 감싼다.
      try {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        locationSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10 },
          (loc) => {
            setUserLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        );

        headingSub = await Location.watchHeadingAsync((h) => {
          // 진북을 구할 수 없으면 trueHeading이 -1이므로 자북 기준값으로 폴백
          setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
        });
      } catch {
        // 초기 위치는 lastKnown 으로 표시되지만, 최신 위치를 못 가져왔음을 안내한다
        toast.info('현재 위치를 확인할 수 없습니다.', '위치 서비스와 권한을 확인해주세요.');
      }
    })();

    return () => {
      locationSub?.remove();
      headingSub?.remove();
    };
  }, [setUserLocation]);

  return { heading };
}

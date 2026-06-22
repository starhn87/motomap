import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { useMapStore } from '@/stores/useMapStore';

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
    })();

    return () => {
      locationSub?.remove();
      headingSub?.remove();
    };
  }, [setUserLocation]);

  return { heading };
}

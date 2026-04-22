import { NaverMapPathOverlay } from '@mj-studio/react-native-naver-map';
import type { Route } from '@/lib/api/directions';

export default function RouteLine({ route }: { route: Route }) {
  const coords = route.geometry.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  if (coords.length < 2) return null;

  return (
    <NaverMapPathOverlay
      coords={coords}
      width={6}
      color="#22C55E"
      outlineWidth={2}
      outlineColor="#FFFFFF"
      passedColor="#A1A1AA"
    />
  );
}

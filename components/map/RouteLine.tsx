import { NaverMapPathOverlay } from '@mj-studio/react-native-naver-map';
import type { Route } from '@/lib/api/directions';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function RouteLine({ route }: { route: Route }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const coords = route.geometry.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  if (coords.length < 2) return null;

  return (
    <NaverMapPathOverlay
      coords={coords}
      width={6}
      color={colors.tint}
      outlineWidth={2}
      outlineColor={colors.background}
      passedColor="#A1A1AA"
    />
  );
}

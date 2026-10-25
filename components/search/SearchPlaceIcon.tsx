import type { ReactNode } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFavoritePlaces } from '@/hooks/useFavorites';
import Ionicons from '@expo/vector-icons/Ionicons';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { personalPlaceKind, isFavoritePoint } from '@/lib/favoriteMatching';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';
import type { PlaceCategory } from '@/types';

// 집·회사·즐겨찾기는 일반 장소 핀과 다른 모양으로 구분한다.
export default function SearchPlaceIcon({ point, favorite = false, category, size = 20, fallback }: {
  point: { name?: string; placeName?: string; address?: string; roadAddress?: string; latitude: number; longitude: number };
  favorite?: boolean;
  category?: PlaceCategory;
  fallback?: ReactNode;
  size?: number;
}) {
  const places = useMyPlacesStore(state => state.places);
  const colors = Colors[useColorScheme() ?? 'light'];
  const personal = personalPlaceKind(point, places);
  const icon = personal === 'home' ? 'home' : personal === 'work' ? 'business' : favorite ? 'star' : null;
  if (icon) return <Ionicons name={icon} size={size} color={icon === 'star' ? semantic.star : colors.tint} />;
  if (fallback) return fallback;
  return category ? <CategoryIcon category={category} size={size} /> : <Ionicons name="location-outline" size={size} color={colors.textSecondary} />;
}

export function RoutePointIcon({ point, icon, size }: {
  point?: { name?: string; address?: string; latitude: number; longitude: number; placeId?: string; generalPlaceId?: string } | null;
  icon: 'radiobox-marked' | 'circle-medium' | 'map-marker'; size: number;
}) {
  const { data: favorites } = useFavoritePlaces(!!point);
  const colors = Colors[useColorScheme() ?? 'light'];
  const fallback = <MaterialCommunityIcons name={icon} size={size} color={colors.textSecondary} />;
  return point ? <SearchPlaceIcon point={point} favorite={isFavoritePoint(point, favorites)} size={size} fallback={fallback} /> : fallback;
}

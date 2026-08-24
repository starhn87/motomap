import { ensureGeneralPlace, findGeneralPlace, type GeneralPlaceInput } from '@/lib/api/generalPlaces';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';
import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';

export interface PlaceRecommendationState {
  count: number;
  recommendedByMe: boolean;
}

export interface GeneralPlaceShareState {
  count: number;
  sharedByMe: boolean;
  generalPlaceId: string | null;
}

export async function fetchPlaceRecommendation(
  placeId: string,
): Promise<PlaceRecommendationState> {
  const { data, error } = await supabase.rpc('get_place_recommendation', {
    p_place_id: placeId,
  });
  if (error) throw error;
  const row = (data as any[] | null)?.[0];
  return {
    count: Number(row?.recommendation_count) || 0,
    recommendedByMe: !!row?.recommended_by_me,
  };
}

export async function togglePlaceRecommendation(placeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_place_recommendation', {
    p_place_id: placeId,
  });
  if (error) throw error;
  return !!data;
}

export async function fetchGeneralPlaceShare(
  place: GeneralPlaceInput,
): Promise<GeneralPlaceShareState> {
  const generalPlace = await findGeneralPlace(place);
  if (!generalPlace || generalPlace.promotedPlaceId) {
    return { count: 0, sharedByMe: false, generalPlaceId: generalPlace?.id ?? null };
  }

  const { data, error } = await supabase.rpc('get_general_place_share', {
    p_general_place_id: generalPlace.id,
  });
  if (error) throw error;
  const row = (data as any[] | null)?.[0];
  return {
    count: Number(row?.share_count) || 0,
    sharedByMe: !!row?.shared_by_me,
    generalPlaceId: generalPlace.id,
  };
}

export async function toggleGeneralPlaceShare(
  place: GeneralPlaceInput,
): Promise<{ shared: boolean; generalPlaceId: string }> {
  const generalPlace = await ensureGeneralPlace(place);
  const { data, error } = await supabase.rpc('toggle_general_place_share', {
    p_general_place_id: generalPlace.id,
  });
  if (error) throw error;
  return { shared: !!data, generalPlaceId: generalPlace.id };
}

export async function fetchTopRecommendedPlaces(): Promise<Place[]> {
  const { data, error } = await supabase.rpc('top_recommended_places', { p_limit: 5 });
  if (error) throw error;
  return ((data ?? []) as PlaceRow[]).map(rowToPlace);
}

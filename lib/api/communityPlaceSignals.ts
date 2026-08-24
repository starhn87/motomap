import { ensureGeneralPlace, findGeneralPlace, type GeneralPlaceInput } from '@/lib/api/generalPlaces';
import { supabase } from '@/lib/supabase';

export interface GeneralPlaceShareState {
  count: number;
  sharedByMe: boolean;
  generalPlaceId: string | null;
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

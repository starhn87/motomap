import type { RiderFactCode } from '@/constants/riderFacts';
import { supabase } from '@/lib/supabase';

export interface RiderPlaceFact {
  code: RiderFactCode;
  confirmations: number;
  confirmedByMe: boolean;
}

export async function fetchPlaceRiderFacts(placeId: string): Promise<RiderPlaceFact[]> {
  const { data, error } = await supabase.rpc('get_place_rider_facts', {
    p_place_id: placeId,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    code: row.fact_code as RiderFactCode,
    confirmations: Number(row.confirmations) || 0,
    confirmedByMe: !!row.confirmed_by_me,
  }));
}

export async function togglePlaceRiderFact(
  placeId: string,
  code: RiderFactCode,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_place_rider_fact', {
    p_place_id: placeId,
    p_fact_code: code,
  });
  if (error) throw error;
  return !!data;
}

export interface BikePlaceMatch {
  placeId: string;
  exactRiders: number;
  similarRiders: number;
  supporters: number;
  kind: 'same_model' | 'same_category';
  visitedByMe: boolean;
}

export async function fetchBikePlaceMatches(
  placeIds: string[],
  bikeCategory?: string,
): Promise<Record<string, BikePlaceMatch>> {
  if (placeIds.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < placeIds.length; i += 200) chunks.push(placeIds.slice(i, i + 200));
  const responses = await Promise.all(
    chunks.map((chunk) =>
      supabase.rpc('bike_place_matches_v1', {
        p_place_ids: chunk,
        p_bike_category: bikeCategory ?? undefined,
      }),
    ),
  );

  const matches: Record<string, BikePlaceMatch> = {};
  for (const { data, error } of responses) {
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      matches[row.place_id] = {
        placeId: row.place_id,
        exactRiders: Number(row.exact_riders) || 0,
        similarRiders: Number(row.similar_riders) || 0,
        supporters: Number(row.supporters) || 0,
        kind: row.match_kind === 'same_model' ? 'same_model' : 'same_category',
        visitedByMe: !!row.visited_by_me,
      };
    }
  }
  return matches;
}

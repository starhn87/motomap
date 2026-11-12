import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { MyPlace, MyPlaceSlot, MyPlaces } from '@/stores/useMyPlacesStore';

function readPlace(value: Json | null): MyPlace | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const { name, address, latitude, longitude } = value;
  if (typeof name === 'string' && typeof address === 'string'
    && typeof latitude === 'number' && typeof longitude === 'number') {
    return { name, address, latitude, longitude };
  }
}

export async function fetchAccountPlaces(owner: string, signal: AbortSignal): Promise<MyPlaces> {
  const { data, error } = await supabase.from('account_personal_places')
    .select('slot,place').eq('user_id', owner).abortSignal(signal);
  if (error) throw error;
  const places: MyPlaces = {};
  for (const row of data) {
    if (row.slot !== 'home' && row.slot !== 'work') continue;
    const place = readPlace(row.place);
    if (place) places[row.slot] = place;
  }
  return places;
}

export async function importAccountPlaces(owner: string, places: MyPlaces, signal: AbortSignal) {
  const rows = (['home', 'work'] as const).flatMap(slot => {
    const place = places[slot];
    return place ? [{ user_id: owner, slot, place: { ...place } }] : [];
  });
  if (!rows.length) return;
  // 동기화한 값과 다른 기기에서 삭제한 슬롯을 로컬 값으로 덮지 않는다.
  const { error } = await supabase.from('account_personal_places')
    .upsert(rows, { onConflict: 'user_id,slot', ignoreDuplicates: true }).abortSignal(signal);
  if (error) throw error;
}

export async function saveAccountPlace(owner: string, slot: MyPlaceSlot, place: MyPlace | undefined, signal: AbortSignal) {
  const { error } = await supabase.from('account_personal_places')
    .upsert({ user_id: owner, slot, place: place ? { ...place } : null }, { onConflict: 'user_id,slot' })
    .abortSignal(signal);
  if (error) throw error;
}

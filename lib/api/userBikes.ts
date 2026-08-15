import { canonicalBikeModel } from '@/constants/bikes';
import { requireUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export interface UserBike {
  id: string;
  userId: string;
  model: string;
  nickname: string | null;
  modelYear: number | null;
  color: string | null;
  photoUrl: string | null;
  isActive: boolean;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserBikeInput {
  model: string;
  nickname?: string | null;
  modelYear?: number | null;
  color?: string | null;
  photoUrl?: string | null;
}

function toUserBike(row: any): UserBike {
  return {
    id: row.id,
    userId: row.user_id,
    model: row.model,
    nickname: row.nickname ?? null,
    modelYear: row.model_year ?? null,
    color: row.color ?? null,
    photoUrl: row.photo_url ?? null,
    isActive: !!row.is_active,
    retiredAt: row.retired_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clean(input: UserBikeInput) {
  const entered = input.model.trim();
  return {
    model: canonicalBikeModel(entered) ?? entered,
    nickname: input.nickname?.trim() || null,
    model_year: input.modelYear ?? null,
    color: input.color?.trim() || null,
    photo_url: input.photoUrl ?? null,
  };
}

export async function fetchUserBikes(): Promise<UserBike[]> {
  const { data, error } = await supabase
    .from('user_bikes')
    .select('*')
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toUserBike);
}

export async function createUserBike(
  input: UserBikeInput,
  isFirstBike: boolean,
): Promise<UserBike> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('user_bikes')
    .insert({ ...clean(input), user_id: user.id, is_active: isFirstBike })
    .select('*')
    .single();
  if (error) throw error;
  return toUserBike(data);
}

export async function updateUserBike(id: string, input: UserBikeInput): Promise<void> {
  const { error } = await supabase.from('user_bikes').update(clean(input)).eq('id', id);
  if (error) throw error;
}

export async function setActiveUserBike(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_active_user_bike', { p_bike_id: id });
  if (error) throw error;
}

export async function deleteUserBike(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_user_bike', { p_bike_id: id });
  if (error) throw error;
}

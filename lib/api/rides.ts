import { supabase } from '@/lib/supabase';
import type { Ride } from '@/types';

function rowToRide(row: any): Ride {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title ?? '',
    coordinates: row.coordinates ?? [],
    distance: Number(row.distance) || 0,
    duration: row.duration ?? 0,
    avgSpeed: Number(row.avg_speed) || 0,
    maxSpeed: Number(row.max_speed) || 0,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchRides(): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(rowToRide);
}

export async function fetchRideById(id: string): Promise<Ride> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  return rowToRide(data);
}

export async function saveRide(params: {
  title: string;
  coordinates: [number, number][];
  distance: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
  startedAt: string;
  endedAt: string;
}): Promise<Ride> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('rides')
    .insert({
      user_id: user.id,
      title: params.title,
      coordinates: params.coordinates,
      distance: params.distance,
      duration: params.duration,
      avg_speed: params.avgSpeed,
      max_speed: params.maxSpeed,
      started_at: params.startedAt,
      ended_at: params.endedAt,
    })
    .select()
    .single();

  if (error) throw error;

  return rowToRide(data);
}

export async function updateRideTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('rides')
    .update({ title })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteRide(id: string): Promise<void> {
  const { error } = await supabase.from('rides').delete().eq('id', id);

  if (error) throw error;
}

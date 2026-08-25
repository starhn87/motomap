import { supabase } from '@/lib/supabase';
import type { PlaceOperationalStatus } from '@/types';

interface OperationalStatusRow {
  place_id: string;
  operational_status: PlaceOperationalStatus;
}

export async function fetchActivePlaceOperationalStatuses(): Promise<
  Record<string, PlaceOperationalStatus>
> {
  const { data, error } = await supabase.rpc('active_place_operational_statuses');
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as OperationalStatusRow[]).map((row) => [
      row.place_id,
      row.operational_status,
    ]),
  );
}

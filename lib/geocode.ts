import { supabase } from '@/lib/supabase';

interface GeoResult {
  latitude: number;
  longitude: number;
  address: string;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('naver-geocode', {
      body: { address },
    });
    if (error || !data?.result) return null;
    return data.result as GeoResult;
  } catch {
    return null;
  }
}

import { requireEnv } from '@/lib/env';

const CLIENT_ID = requireEnv(process.env.EXPO_PUBLIC_NAVER_CLIENT_ID, 'EXPO_PUBLIC_NAVER_CLIENT_ID');
const CLIENT_SECRET = requireEnv(process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET, 'EXPO_PUBLIC_NAVER_CLIENT_SECRET');

interface GeoResult {
  latitude: number;
  longitude: number;
  address: string;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
        'X-NCP-APIGW-API-KEY': CLIENT_SECRET,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();

    if (!data.addresses?.length) return null;

    const first = data.addresses[0];
    return {
      latitude: Number(first.y),
      longitude: Number(first.x),
      address: first.roadAddress || first.jibunAddress || address,
    };
  } catch {
    return null;
  }
}

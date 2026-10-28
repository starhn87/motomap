import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { enforceRateLimits } from '../_shared/rateLimit.ts';
import { createTmapPoiHandler, type TmapClaim, type TmapSnapshot } from '../_shared/tmapPoiSearch.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '', anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createTmapPoiHandler({
  appKey: Deno.env.get('TMAP_APP_KEY') ?? '', fetch,
  limit: req => enforceRateLimits(req, [{ scope: 'tmap-poi-burst', limit: 30, windowSeconds: 300 }, { scope: 'tmap-poi-daily', limit: 500, windowSeconds: 86400 }]),
  authorize: async (req, secret, actor) => {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get('authorization') ?? `Bearer ${anon}` } } });
    const { data, error } = await client.rpc('location_privacy', { p_action: 'status', p_secret: secret,
      p_payload: { expectedActor: actor, clientCapabilities: ['tmap'] } });
    return !error && data?.status === 'active' && data.version === '2026-10-11-location-v2' && Array.isArray(data.providers) && data.providers.includes('tmap');
  },
  claim: async (lat, lon, coverageKm) => {
    const { data, error } = await admin.rpc('claim_tmap_poi_refresh', { p_lat: lat, p_lon: lon, p_coverage_km: coverageKm });
    if (error || !data) throw new Error('cache_unavailable');
    return data as TmapClaim;
  },
  save: async (lat, lon, token, snapshot: TmapSnapshot) => {
    const { error } = await admin.rpc('finish_tmap_poi_refresh', { p_lat: lat, p_lon: lon, p_token: token, p_snapshot: snapshot });
    if (error) throw new Error('cache_unavailable');
  },
}));

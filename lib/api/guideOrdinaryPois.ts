import { providerLocationAllowed, withCoordinateUse, useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { supabase } from '@/lib/supabase';
import { ProviderError, edgeProviderError, rememberProviderFailure, requireProviderAvailable } from '@/lib/providerErrors';
import { insidePoiBounds, validPoiBounds, type GuidePoi, type PoiBounds } from '@/lib/guidePoiCatalog';
import { tmapCell, TMAP_INDUSTRIES, TMAP_DEVICE_TTL, TMAP_SERVER_TTL, validTmapCell } from '../../supabase/functions/_shared/tmapPoi';

// 공급자 원본 만료를 공유하는 세션 메모리 캐시. 로그아웃·동의 변경 때 비운다.
const cache = new Map<string, { pois: GuidePoi[]; expiresAt: number; partial: boolean }>();
export function clearGuideOrdinaryPoiCache() { cache.clear(); }
export async function fetchGuideOrdinaryPois(bounds: PoiBounds, signal: AbortSignal, focus?: { latitude: number; longitude: number }): Promise<{ pois: GuidePoi[]; partial: boolean; expiresAt: number }> {
  if (!validPoiBounds(bounds)) throw new ProviderError('tmap-poi', 'search', 'invalid_request');
  if (!providerLocationAllowed('tmap') || signal.aborted) throw new ProviderError('tmap-poi', 'search', 'cancelled');
  const state = useLocationPrivacyStore.getState(), revision = state.revision, actor = state.actor;
  const current = () => !signal.aborted && providerLocationAllowed('tmap') && useLocationPrivacyStore.getState().revision === revision && useLocationPrivacyStore.getState().actor === actor;
  const center = focus && insidePoiBounds(focus, bounds) ? focus : { latitude: (bounds.south + bounds.north) / 2, longitude: (bounds.west + bounds.east) / 2 };
  const cell = tmapCell(center), key = `${cell.lat}:${cell.lon}`;
  if (!validTmapCell(cell)) return { pois: [], partial: false, expiresAt: Date.now() + TMAP_DEVICE_TTL };
  // 5km 공급자 검색은 격자 모서리 차이를 포함해 중심 약3km의 표시를 덮는다.
  const halfLat = 3000 / Math.SQRT2 / 111_320, halfLon = halfLat / Math.cos(center.latitude * Math.PI / 180);
  const searchBounds = { south: Math.max(bounds.south, center.latitude - halfLat), north: Math.min(bounds.north, center.latitude + halfLat),
    west: Math.max(bounds.west, center.longitude - halfLon), east: Math.min(bounds.east, center.longitude + halfLon) };
  const result = (entry: { pois: GuidePoi[]; partial: boolean; expiresAt: number }) => ({ pois: entry.pois.filter(p => insidePoiBounds(p, searchBounds)), partial: entry.partial, expiresAt: entry.expiresAt });
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return result(cached);
  cache.delete(key);
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  const timer = setTimeout(abort, 16_000);
  try {
    requireProviderAvailable('tmap-poi');
    const { data, error } = await withCoordinateUse(center, 'search', 'tmap', () => supabase.functions.invoke('tmap-poi-search', {
      body: { ...cell, secret: state.secret, actor }, signal: controller.signal,
    }));
    if (!current()) throw new ProviderError('tmap-poi', 'search', 'cancelled');
    if (controller.signal.aborted) throw new ProviderError('tmap-poi', 'search', 'timeout');
    if (error) {
      let kind: unknown;
      try { kind = (await (error as { context?: Response }).context?.clone().json())?.kind; } catch { /* 공급자 원문은 버린다. */ }
      if (['configuration', 'temporary', 'timeout', 'rate_limited', 'invalid_request', 'invalid_response'].includes(String(kind))) throw new ProviderError('tmap-poi', 'search', kind as ProviderError['kind']);
      throw edgeProviderError('tmap-poi', 'search', error);
    }
    const now = Date.now();
    if (!data || !Array.isArray(data.pois) || data.pois.length > 1800 || typeof data.partial !== 'boolean' ||
      !Number.isFinite(data.fetchedAt) || !Number.isFinite(data.expiresAt) || data.fetchedAt > now + 60_000 ||
      data.expiresAt <= now || data.expiresAt <= data.fetchedAt || data.expiresAt - data.fetchedAt > TMAP_SERVER_TTL) throw new ProviderError('tmap-poi', 'search', 'invalid_response');
    const pois: GuidePoi[] = data.pois.map((row: Record<string, unknown>) => {
      if (!row || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 100 || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200 ||
        typeof row.address !== 'string' || row.address.length > 1000 || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
        Number(row.latitude) < 32 || Number(row.latitude) > 39 || Number(row.longitude) < 124 || Number(row.longitude) > 132 || !TMAP_INDUSTRIES.includes(String(row.industry))) throw new ProviderError('tmap-poi', 'search', 'invalid_response');
      return { key: `tmap:${row.id}`, provider: 'tmap', providerId: row.id, name: row.name.trim(), address: row.address,
        latitude: Number(row.latitude), longitude: Number(row.longitude), industry: row.industry as GuidePoi['industry'] };
    });
    const entry = { pois, partial: data.partial, expiresAt: Math.min(data.expiresAt, now + TMAP_DEVICE_TTL) };
    if (!current()) throw new ProviderError('tmap-poi', 'search', 'cancelled');
    cache.set(key, entry);
    while (cache.size > 12) cache.delete(cache.keys().next().value!);
    return result(entry);
  } catch (error) {
    const failure = !current() ? new ProviderError('tmap-poi', 'search', 'cancelled') : error instanceof ProviderError ? error : edgeProviderError('tmap-poi', 'search', error);
    rememberProviderFailure(failure); throw failure;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

export const GAS_PRICE_TTL_MS = 60 * 60 * 1000;
export const GAS_EMPTY_TTL_MS = 5 * 60 * 1000;
export const GAS_PARTIAL_TTL_MS = 60 * 1000;
const LEGACY_TTL_MS = 3 * 60 * 1000;

export interface GasCacheMetadata { fetchedAt: number; expiresAt: number }

// 서버 캐시의 나이를 그대로 이어받는다. 서버/기기 시계 차이는 serverTime으로
// 보정하고 요청 왕복 시간도 빼므로 수신 시점에서 1시간을 새로 시작하지 않는다.
export function gasCacheMetadata(data: unknown, startedAt: number, hasPrice: boolean): GasCacheMetadata {
  const now = Date.now(), maxTTL = hasPrice ? GAS_PRICE_TTL_MS : GAS_EMPTY_TTL_MS;
  const value = data as Partial<GasCacheMetadata> & { serverTime?: number };
  if (value && [value.fetchedAt, value.expiresAt, value.serverTime].every(n => typeof n === 'number' && Number.isFinite(n))
    && value.expiresAt! >= value.fetchedAt! && value.serverTime! >= value.fetchedAt!) {
    const elapsed = Math.max(0, now - startedAt);
    const age = Math.max(0, value.serverTime! - value.fetchedAt!) + elapsed;
    const remaining = Math.max(0, Math.min(value.expiresAt! - value.serverTime! - elapsed, maxTTL - age));
    return { fetchedAt: now - age, expiresAt: now + remaining };
  }
  // 구 서버 응답을 새 1시간 데이터로 간주하지 않는다.
  return { fetchedAt: startedAt, expiresAt: startedAt + Math.min(LEGACY_TTL_MS, maxTTL) };
}

export function mergedGasExpiry(snapshots: GasCacheMetadata[], hasPrice: boolean, partial = false) {
  const now = Date.now();
  return Math.min(now + (partial ? GAS_PARTIAL_TTL_MS : hasPrice ? GAS_PRICE_TTL_MS : GAS_EMPTY_TTL_MS),
    ...snapshots.map(snapshot => snapshot.expiresAt));
}

// React Query의 staleTime은 남은 시간이 아니라 dataUpdatedAt부터의 기간이다.
export function gasQueryStaleTime(query: { state: { data: unknown; dataUpdatedAt: number } }) {
  const data = query.state.data as Partial<GasCacheMetadata> | null | undefined;
  return data?.expiresAt === undefined ? GAS_EMPTY_TTL_MS : Math.max(0, data.expiresAt - query.state.dataUpdatedAt);
}

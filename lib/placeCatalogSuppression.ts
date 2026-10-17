let suppressed = new Set<string>();

export function replacePlaceCatalogSuppressions(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const next = new Set<string>();
  for (const row of value) {
    if (!row || typeof row.provider !== 'string' || typeof row.providerId !== 'string'
        || !row.provider || !row.providerId) return false;
    next.add(`${row.provider}:${row.providerId}`);
  }
  suppressed = next;
  return true;
}

/** 공급자가 확인한 ID만 사용한다. 이름·주소의 유사성으로 다른 업체를 숨기지 않는다. */
export function isSuppressedExternalPlace(row: {
  source?: string;
  providerId?: string;
  generalPlaceSource?: { provider: string; providerId: string };
}): boolean {
  const identity = row.generalPlaceSource;
  if (identity && suppressed.has(`${identity.provider}:${identity.providerId}`)) return true;
  return !!row.providerId && suppressed.has(`${row.source ?? 'kakao'}:${row.providerId}`);
}

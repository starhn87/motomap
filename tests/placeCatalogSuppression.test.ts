import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './helpers/loadModule';
test('only verified provider IDs are suppressed; malformed update preserves previous set', () => {
  const api = loadModule<{
    replacePlaceCatalogSuppressions(value: unknown): boolean;
    isSuppressedExternalPlace(value: unknown): boolean;
  }>('lib/placeCatalogSuppression.ts', {});
  assert.equal(api.replacePlaceCatalogSuppressions([{ provider: 'kakao', providerId: '123' }]), true);
  assert.equal(api.isSuppressedExternalPlace({ source: 'kakao', providerId: '123' }), true);
  assert.equal(api.isSuppressedExternalPlace({ source: 'naver', providerId: '123' }), false);
  assert.equal(api.isSuppressedExternalPlace({ source: 'naver', providerId: '123', generalPlaceSource: {provider:'kakao',providerId:'123'} }), true);
  assert.equal(api.isSuppressedExternalPlace({ name: 'same name' }), false);
  assert.equal(api.replacePlaceCatalogSuppressions([{ provider: 'kakao' }]), false);
  assert.equal(api.isSuppressedExternalPlace({ providerId: '123' }), true);
  assert.equal(api.replacePlaceCatalogSuppressions([]), true);
  assert.equal(api.isSuppressedExternalPlace({ providerId: '123' }), false);
});

test('external provider result uses suppression before returning while preserving source metadata', async () => {
  const suppression = loadModule<any>('lib/placeCatalogSuppression.ts', {});
  suppression.replacePlaceCatalogSuppressions([{ provider: 'kakao', providerId: 'closed' }]);
  const api = loadModule<typeof import('../lib/api/externalPlaces')>('lib/api/externalPlaces.ts', {
    '@/lib/placeCatalogSuppression': suppression,
    '@/lib/api/kakaoLocal': { searchKakaoLocalPage: async () => ({ results: [
      { source: 'kakao', providerId: 'closed', placeName: 'Cafe' },
      { source: 'kakao', providerId: 'open', placeName: 'Cafe' },
    ], totalCount: 2, pageableCount: 2, isEnd: true }) },
    '@/lib/api/naverLocal': { searchNaverLocal: async () => { throw new Error('should not fallback'); } },
    '@/lib/providerErrors': { ProviderError: class extends Error {} },
  });
  const page = await api.searchExternalPlacesPage('Cafe');
  assert.equal(page.results.length, 1);
  assert.equal(page.results[0].providerId, 'open');
  assert.equal(page.totalCount, 2); assert.equal(page.isEnd, true);
});

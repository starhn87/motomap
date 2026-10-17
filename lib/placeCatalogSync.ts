import type { QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { replacePlaceCatalogSuppressions } from '@/lib/placeCatalogSuppression';

const CATALOG_QUERY_PREFIXES = [
  'places', 'place', 'favorites', 'search', 'search-kakao',
  'nearby-of', 'course-places', 'riding-guides',
];

/** 활성 화면에서만 실행한다. 최초 성공도 이미 채워진 캐시를 다시 확인한다. */
export function startPlaceCatalogSync(client: QueryClient): () => void {
  let stopped = false;
  let running = false;
  let revision: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let request: AbortController | undefined;

  async function check() {
    if (stopped || running || AppState.currentState !== 'active') return;
    running = true;
    const requestGeneration = generation;
    const controller = new AbortController();
    request = controller;
    const deadline = setTimeout(() => controller.abort(), 10_000);
    try {
      const { data, error } = await supabase.rpc('get_place_catalog_revision').abortSignal(controller.signal);
      if (stopped || requestGeneration !== generation || error
          || typeof data !== 'string' || !/^\d+$/.test(data)) return;
      if (revision !== data) {
        const suppression = await supabase.rpc('get_place_catalog_suppressions').abortSignal(controller.signal);
        if (stopped || requestGeneration !== generation || suppression.error
            || !replacePlaceCatalogSuppressions(suppression.data)) return;
        // 활성 조회는 즉시 다시 읽고 비활성 조회는 다음 사용 시 다시 읽는다.
        await Promise.all(CATALOG_QUERY_PREFIXES.map((key) =>
          client.invalidateQueries({ queryKey: [key] }, { throwOnError: true })));
        revision = data;
      }
    } catch {
      // 서버를 먼저 배포하지 않았거나 오프라인이어도 기존 탐색은 계속 허용한다.
    } finally {
      clearTimeout(deadline);
      request = undefined;
      running = false;
      if (!stopped && AppState.currentState === 'active') {
        clearTimeout(timer);
        timer = setTimeout(() => { void check(); }, requestGeneration === generation ? 30_000 : 0);
      }
    }
  }

  const subscription = AppState.addEventListener('change', (state) => {
    clearTimeout(timer);
    generation += 1;
    request?.abort();
    if (state === 'active') void check();
  });
  void check();
  return () => {
    stopped = true;
    generation += 1;
    request?.abort();
    clearTimeout(timer);
    subscription.remove();
  };
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { searchUnifiedPlaces } from '@/lib/api/search';
import { queryKeys } from '@/lib/queryKeys';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function useUnifiedPlaceSearch({
  query,
  near,
  nearKey,
  enabled = true,
  minimumLength = 2,
  debounceMs = 300,
}: {
  query: string;
  near: { latitude: number; longitude: number } | undefined;
  nearKey: string;
  enabled?: boolean;
  minimumLength?: number;
  debounceMs?: number;
}) {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, debounceMs);
  const canSearch = enabled && debouncedQuery.length >= minimumLength;
  const result = useQuery({
    queryKey: queryKeys.search.unified(debouncedQuery, nearKey),
    queryFn: ({ signal }) => searchUnifiedPlaces(debouncedQuery, near, { signal }),
    enabled: canSearch,
  });

  return {
    ...result,
    debouncedQuery,
    isDebouncing: enabled && normalizedQuery !== debouncedQuery,
    isSearching:
      enabled &&
      normalizedQuery.length >= minimumLength &&
      (normalizedQuery !== debouncedQuery || result.isLoading || result.isFetching),
  };
}

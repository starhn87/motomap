export const queryKeys = {
  places: {
    all: ['places'] as const,
    detail: (id: string | null | undefined) => ['place', id] as const,
  },
  favorites: {
    all: ['favorites'] as const,
    summary: (userId: string | undefined) => ['favorites', userId] as const,
    places: (userId: string | undefined) => ['favorites', 'places', userId] as const,
  },
  search: {
    all: ['search'] as const,
    unified: (query: string, nearKey: string) =>
      ['search', 'unified', query, nearKey] as const,
    registered: (...scope: readonly unknown[]) => ['search', ...scope] as const,
    kakao: (...scope: readonly unknown[]) => ['search-kakao', ...scope] as const,
  },
};

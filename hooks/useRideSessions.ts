import { useQuery } from '@tanstack/react-query';

import {
  fetchRideSession,
  fetchRideSessions,
  type RideSessionQuery,
} from '@/lib/api/rideSessions';
import { useAuthStore } from '@/stores/useAuthStore';

export function useRideSessions(query: Omit<RideSessionQuery, 'before' | 'limit'>) {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: ['ride-sessions', userId, query.from, query.to, query.bikeId ?? null],
    queryFn: () => fetchRideSessions(query),
    enabled: !!userId,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useRideSession(id: string | undefined) {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: ['ride-session', userId, id],
    queryFn: () => fetchRideSession(id!),
    enabled: !!userId && !!id,
    staleTime: 60_000,
  });
}

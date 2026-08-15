import { useQuery } from '@tanstack/react-query';

import { fetchUserBikes, type UserBike } from '@/lib/api/userBikes';
import { useAuthStore } from '@/stores/useAuthStore';

export function useUserBikes() {
  const user = useAuthStore((state) => state.user);
  return useQuery<UserBike[]>({
    queryKey: ['user-bikes', user?.id],
    queryFn: fetchUserBikes,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchRides,
  fetchRideById,
  saveRide,
  updateRideTitle,
  deleteRide,
} from '@/lib/api/rides';
import { useAuthStore } from '@/stores/useAuthStore';

export function useRides() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['rides', user?.id],
    queryFn: () => fetchRides(),
    enabled: !!user,
  });
}

export function useRide(id: string | null) {
  return useQuery({
    queryKey: ['rides', 'detail', id],
    queryFn: () => fetchRideById(id!),
    enabled: !!id,
  });
}

export function useSaveRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveRide,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
  });
}

export function useUpdateRideTitle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => updateRideTitle(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      queryClient.invalidateQueries({ queryKey: ['rides', 'detail', id] });
    },
  });
}

export function useDeleteRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRide,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
  });
}

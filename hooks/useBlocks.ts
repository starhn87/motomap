import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  fetchBlockedIds,
  fetchBlockedUsers,
  blockUser,
  unblockUser,
} from '@/lib/api/blocks';
import { useAuthStore } from '@/stores/useAuthStore';

export function useBlockedIds() {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery({
    queryKey: ['blocks', 'ids', user?.id],
    queryFn: fetchBlockedIds,
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
  return useMemo(() => new Set(data ?? []), [data]);
}

export function useBlockedUsers() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['blocks', 'users', user?.id],
    queryFn: fetchBlockedUsers,
    enabled: !!user,
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: blockUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unblockUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });
}

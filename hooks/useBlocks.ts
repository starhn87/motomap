import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  fetchBlockedIds,
  fetchBlockedUsers,
  blockUser,
  unblockUser,
  type BlockedUser,
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
  const user = useAuthStore((s) => s.user);
  const idsKey = ['blocks', 'ids', user?.id] as const;
  return useMutation({
    mutationFn: blockUser,
    onMutate: async (blockedId) => {
      await qc.cancelQueries({ queryKey: idsKey });
      const previousIds = qc.getQueryData<string[]>(idsKey);
      qc.setQueryData<string[]>(idsKey, (current) => [
        ...new Set([...(current ?? []), blockedId]),
      ]);
      return { previousIds };
    },
    onError: (_error, _blockedId, context) => {
      if (context?.previousIds) qc.setQueryData(idsKey, context.previousIds);
      else qc.removeQueries({ queryKey: idsKey, exact: true });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const idsKey = ['blocks', 'ids', user?.id] as const;
  const usersKey = ['blocks', 'users', user?.id] as const;
  return useMutation({
    mutationFn: unblockUser,
    onMutate: async (blockedId) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: idsKey }),
        qc.cancelQueries({ queryKey: usersKey }),
      ]);
      const previousIds = qc.getQueryData<string[]>(idsKey);
      const previousUsers = qc.getQueryData<BlockedUser[]>(usersKey);
      qc.setQueryData<string[]>(idsKey, (current) =>
        current?.filter((id) => id !== blockedId),
      );
      qc.setQueryData<BlockedUser[]>(usersKey, (current) =>
        current?.filter((blockedUser) => blockedUser.userId !== blockedId),
      );
      return { previousIds, previousUsers };
    },
    onError: (_error, _blockedId, context) => {
      if (!context) return;
      if (context.previousIds) qc.setQueryData(idsKey, context.previousIds);
      if (context.previousUsers) qc.setQueryData(usersKey, context.previousUsers);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });
}

import { supabase } from '@/lib/supabase';
import { requireUser, getCurrentUser } from '@/lib/auth';

export interface BlockedUser {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  blockedAt: string;
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, profiles!blocks_blocked_id_fkey(nickname, avatar_url)')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    userId: row.blocked_id,
    nickname: row.profiles?.nickname ?? '알 수 없음',
    avatarUrl: row.profiles?.avatar_url ?? null,
    blockedAt: row.created_at,
  }));
}

export async function fetchBlockedIds(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id);

  if (error) throw error;

  return (data ?? []).map((row: any) => row.blocked_id);
}

export async function blockUser(blockedId: string): Promise<void> {
  const user = await requireUser();
  if (user.id === blockedId) throw new Error('자신을 차단할 수 없습니다.');

  const { error } = await supabase.from('blocks').insert({
    blocker_id: user.id,
    blocked_id: blockedId,
  });

  if (error) {
    if (error.code === '23505') return;
    throw error;
  }
}

export async function unblockUser(blockedId: string): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) throw error;
}

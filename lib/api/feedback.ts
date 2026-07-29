import { supabase } from '@/lib/supabase';
import { getCurrentUser, requireUser } from '@/lib/auth';

export type FeedbackType = 'bug' | 'feature' | 'general';

export interface MyFeedback {
  id: string;
  type: FeedbackType;
  content: string;
  reply: string | null;
  replyAt: string | null;
  createdAt: string;
}

/** 내가 보낸 건의와 답변 — select 정책은 migration 030 */
export async function fetchMyFeedback(): Promise<MyFeedback[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('feedback')
    .select('id, type, content, reply, reply_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    content: row.content,
    reply: row.reply ?? null,
    replyAt: row.reply_at ?? null,
    createdAt: row.created_at,
  }));
}

export async function submitFeedback(params: {
  type: FeedbackType;
  content: string;
}): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    type: params.type,
    content: params.content,
  });

  if (error) throw error;
}

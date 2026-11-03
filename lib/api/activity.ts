import { supabase } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';

export type SubmissionKind = 'place_submission' | 'feedback';
export type ActivityDismissal = { kind: SubmissionKind; target_id: string };

export async function fetchActivityDismissals(userId: string): Promise<ActivityDismissal[]> {
  const result: ActivityDismissal[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('activity_dismissals').select('kind,target_id').eq('user_id', userId)
      .order('kind').order('target_id').range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    result.push(...rows.map<ActivityDismissal>(row => {
      if (row.kind !== 'place_submission' && row.kind !== 'feedback') throw new Error('알 수 없는 제보 분류입니다.');
      return { kind: row.kind, target_id: row.target_id };
    }));
    if (rows.length < pageSize) return result;
  }
}

export async function dismissSubmission(params: { userId: string; kind: SubmissionKind; id: string }): Promise<void> {
  const user = await requireUser();
  if (user.id !== params.userId) throw new Error('계정이 변경됐어요. 다시 시도해 주세요.');
  const { error } = await supabase.from('activity_dismissals').upsert({
    user_id: params.userId, kind: params.kind, target_id: params.id,
  }, { onConflict: 'user_id,kind,target_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function deleteNotification(params: { userId: string; id: string }): Promise<void> {
  const user = await requireUser();
  if (user.id !== params.userId) throw new Error('계정이 변경됐어요. 다시 시도해 주세요.');
  const { error } = await supabase.from('notifications').delete().eq('id', params.id).eq('user_id', params.userId);
  if (error) throw error;
}

import { supabase } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';

export type FeedbackType = 'bug' | 'feature' | 'general';

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

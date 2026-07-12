import { supabase } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';

export type ReportTargetType = 'review' | 'course_review' | 'place' | 'course' | 'user';
export type ReportReason = 'spam' | 'inappropriate' | 'fake' | 'abuse' | 'copyright' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: '스팸/광고' },
  { key: 'inappropriate', label: '부적절한 콘텐츠' },
  { key: 'fake', label: '허위 정보' },
  { key: 'abuse', label: '욕설/비방' },
  { key: 'copyright', label: '저작권 침해' },
  { key: 'other', label: '기타' },
];

export async function submitReport(params: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason,
    description: params.description?.trim() || null,
  });

  if (error) {
    if (error.code === '23505') throw new Error('이미 신고한 항목입니다.');
    throw error;
  }
}

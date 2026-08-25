import { supabase } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';

export type PlaceChangeReason =
  | 'permanently_closed'
  | 'temporarily_closed'
  | 'moved'
  | 'business_info_changed'
  | 'other';

export const PLACE_CHANGE_REASONS: Array<{
  key: PlaceChangeReason;
  label: string;
  description: string;
}> = [
  { key: 'permanently_closed', label: '폐업', description: '더 이상 영업하지 않아요' },
  { key: 'temporarily_closed', label: '임시 휴업', description: '현재 일시적으로 쉬고 있어요' },
  { key: 'moved', label: '이전', description: '다른 위치로 옮겼어요' },
  {
    key: 'business_info_changed',
    label: '장소 정보 변경',
    description: '상호·주소·전화번호가 달라요',
  },
  { key: 'other', label: '기타', description: '그 밖에 확인이 필요한 내용이 있어요' },
];

async function functionErrorMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== 'object') return '장소 정보 제보를 접수하지 못했습니다.';
  const context = 'context' in error ? (error as { context?: Response }).context : undefined;
  if (context) {
    try {
      const payload = await context.json() as { error?: unknown };
      if (typeof payload.error === 'string') return payload.error;
    } catch {
      // 본문을 읽을 수 없으면 supabase-js 기본 오류 문구를 사용한다.
    }
  }
  return 'message' in error && typeof error.message === 'string'
    ? error.message
    : '장소 정보 제보를 접수하지 못했습니다.';
}

export async function submitPlaceChangeReport(params: {
  placeId: string;
  reason: PlaceChangeReason;
  description?: string;
}): Promise<void> {
  await requireUser();
  const { error } = await supabase.functions.invoke('report-place-change', {
    body: {
      placeId: params.placeId,
      reason: params.reason,
      description: params.description?.trim() || undefined,
    },
  });
  if (error) throw new Error(await functionErrorMessage(error));
}

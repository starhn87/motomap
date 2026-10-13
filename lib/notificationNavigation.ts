import { getNotificationResponsePayloads, isServiceResumeResponse, type ResumeResponse } from './serviceResumeNotification';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const listTypes = new Set([
  'place_rejected', 'place_change_resolved', 'place_change_dismissed',
  'course_rejected', 'riding_guide_rejected', 'feedback_reply', 'notice',
]);

/** 상세가 없는 알림은 목록으로 보낸다. 모르는 타입에서 새 이동 경로를 만들지 않는다. */
export function getNavigationNotificationData(response: ResumeResponse): Record<string, unknown> | null {
  // 원문 쪽이 재개 알림이면 일반 알림으로도 처리하지 않는다.
  if (isServiceResumeResponse(response)) return null;
  return getNotificationResponsePayloads(response).find((data) => {
    if (data.type === 'place_approved' || data.type === 'review_liked') return validId(data.placeId);
    if (data.type === 'course_approved') return validId(data.courseId);
    if (data.type === 'riding_guide_published') return validId(data.guideId);
    return typeof data.type === 'string' && listTypes.has(data.type);
  }) ?? null;
}

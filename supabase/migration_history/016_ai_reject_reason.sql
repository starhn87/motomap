-- AI 판정 시 생성하는 제보자용 반려 안내 문구 저장 칸.
--
-- judge-submission(EF: smart-task)이 판정과 함께 "반려될 경우 제보자에게 보낼
-- 문구"를 미리 만들어 저장하고, 디스코드의 반려 버튼(EF: moderate)을 누르면
-- 이 문구가 rejected_reason 으로 복사되어 015 트리거가 사유 포함 알림을 보낸다.
-- 승인되면 그냥 남는 내부 필드다 (앱에 노출되지 않음).

alter table public.places add column if not exists ai_reject_reason text;
alter table public.courses add column if not exists ai_reject_reason text;

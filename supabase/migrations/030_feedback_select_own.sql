-- 내 건의·답변 조회 (내 제보 목록 화면)
--
-- feedback 은 지금까지 insert 전용이었다 — 답변(021의 reply)은 푸시·알림으로만
-- 전달되고 앱에서 모아 볼 수 없었다. 본인 행 select 를 연다.
-- RLS 활성 상태는 건드리지 않는다(초기 스키마에서 이미 켜져 있음).

drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select using (auth.uid() = user_id);

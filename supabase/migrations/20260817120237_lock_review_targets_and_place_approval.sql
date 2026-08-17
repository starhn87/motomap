-- 리뷰 수정은 내용·별점·사진에만 허용한다. 대상 ID를 바꿔 다른 장소로
-- 리뷰를 옮기는 우회 호출은 DB 권한에서 막는다.
revoke insert, update, delete on table public.reviews from anon;
revoke update on table public.reviews from authenticated;
grant update (rating, content, photos) on table public.reviews to authenticated;

-- 클라이언트가 제보를 바로 승인 상태로 넣거나 심사 결과를 미리 채우지 못하게 한다.
drop policy if exists "장소 제보" on public.places;
create policy "장소 제보"
on public.places for insert
to authenticated
with check (
  (select auth.uid()) = submitted_by
  and approved is false
  and deleted_at is null
  and rejected_reason is null
  and ai_reject_reason is null
  and coalesce(rating, 0) = 0
  and coalesce(review_count, 0) = 0
);

-- 제보 반려/정리는 hard delete 대신 soft delete — 이력 보존·복구 가능.
-- 규칙:
--   · 반려/정리: deleted_at = now() (approved 는 false 유지)
--   · 지도/검색(all_places·nearby_places RPC)은 approved=true 만 반환하므로 영향 없음
--   · '내 제보 목록'(직접 테이블 조회)은 클라이언트에서 deleted_at is null 필터
--   · ⚠️ 승인 시엔 deleted_at 이 null 인 행만 승인할 것 (deleted_at 있는 행을
--     approved=true 로 만들면 RPC 를 통해 지도에 노출된다)

alter table public.places add column if not exists deleted_at timestamptz;

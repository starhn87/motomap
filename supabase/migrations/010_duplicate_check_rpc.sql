-- 제보 중복 방지용 조회 RPC.
-- RLS 가 미승인 행을 타인에게 숨기므로(클라이언트 직접 조회로는 "검토 중" 중복을
-- 못 잡음) SECURITY DEFINER 로 존재 여부만 노출한다 — 행 내용은 반환하지 않는다.
-- 반환: 'approved'(이미 등록됨) | 'pending'(검토 중) | null(없음 — 제보 가능)
-- 반려(soft delete)된 행은 중복으로 치지 않는다(재제보 허용).

create or replace function public.place_exists_at_address(p_address text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when count(*) = 0 then null
    when bool_or(approved) then 'approved'
    else 'pending'
  end
  from public.places
  where address = trim(p_address) and deleted_at is null;
$$;

create or replace function public.course_exists_with_name(p_name text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when count(*) = 0 then null
    when bool_or(approved) then 'approved'
    else 'pending'
  end
  from public.courses
  where name = trim(p_name) and deleted_at is null;
$$;

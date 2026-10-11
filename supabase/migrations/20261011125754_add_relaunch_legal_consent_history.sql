begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.user_consents in share mode;

-- 과거 테이블은 본인 수정 권한이 있으므로 새 버전 문자열을 신뢰해 백필하지 않는다.
do $$ begin
  if exists (select 1 from public.user_consents where
    terms_version <> '2026-08-18' or privacy_version <> '2026-08-18' or location_version <> '2026-08-18') then
    raise exception 'legacy consent versions differ from inspected baseline';
  end if;
end $$;

-- 기존 user_consents는 그대로 둔다. 과거 시각을 보존하는 추가형 이력이다.
create table public.legal_consent_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null,
  location_version text not null,
  location_accepted_at timestamptz not null,
  source text not null check (source in ('legacy', 'explicit')),
  primary key (user_id, terms_version, privacy_version, location_version)
);
alter table public.legal_consent_history enable row level security;
create policy legal_consent_history_select_own on public.legal_consent_history
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.legal_consent_history from public, anon, authenticated;
grant select on public.legal_consent_history to authenticated;
grant all on public.legal_consent_history to service_role;

insert into public.legal_consent_history
select user_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
  location_version, location_accepted_at, 'legacy'
from public.user_consents;

-- 사용자가 타인의 동의·임의 시각을 직접 쓰지 못하게 서버 시각으로만 추가한다.
create or replace function private.record_relaunch_legal_consent(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_accepted_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if p_version is distinct from '2026-10-11' then raise exception 'unsupported legal version'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'profile not ready';
  end if;
  insert into public.legal_consent_history values (
    v_user_id, p_version, v_accepted_at, p_version, v_accepted_at, p_version, v_accepted_at, 'explicit'
  ) on conflict do nothing;
end;
$$;
revoke all on function private.record_relaunch_legal_consent(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.record_relaunch_legal_consent(text) to authenticated;

create or replace function public.accept_legal_documents(p_version text)
returns void language sql security invoker set search_path = '' as $$
  select private.record_relaunch_legal_consent(p_version);
$$;
revoke all on function public.accept_legal_documents(text) from public, anon;
grant execute on function public.accept_legal_documents(text) to authenticated;

create or replace function public.has_accepted_legal_documents(p_version text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.legal_consent_history
    where user_id = (select auth.uid()) and terms_version = p_version
      and privacy_version = p_version and location_version = p_version and source = 'explicit');
$$;
revoke all on function public.has_accepted_legal_documents(text) from public, anon;
grant execute on function public.has_accepted_legal_documents(text) to authenticated;

-- 구버전 RPC는 8/18 계약 그대로 유지한다. 새 가입만 v2를 호출한다.
create or replace function public.complete_onboarding_v2(p_nickname text, p_version text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := btrim(p_nickname);
  v_accepted_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if p_version is distinct from '2026-10-11' then raise exception 'unsupported legal version'; end if;
  if v_nickname is null or char_length(v_nickname) < 2 or char_length(v_nickname) > 15 then
    raise exception 'nickname must be between 2 and 15 characters';
  end if;
  insert into public.profiles (id, nickname, onboarding_completed_at)
    values (v_user_id, v_nickname, v_accepted_at);
  insert into public.user_consents (
    user_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
    location_version, location_accepted_at
  ) values (v_user_id, p_version, v_accepted_at, p_version, v_accepted_at, p_version, v_accepted_at);
  perform private.record_relaunch_legal_consent(p_version);
end;
$$;
revoke all on function public.complete_onboarding_v2(text, text) from public, anon;
grant execute on function public.complete_onboarding_v2(text, text) to authenticated;

comment on table public.legal_consent_history is
  '동의 버전별 최초 수락 이력. legacy는 과거 시각 복사, explicit은 이용자 동의 시 서버 시각. 프로필 삭제 시 파기.';
commit;

-- 소셜 로그인은 Auth 세션이 먼저 생기므로, 프로필이 준비되기 전까지 앱 진입을
-- 막을 수 있는 명시적인 완료 상태를 둔다. 기존 프로필은 이미 기존 가입 절차를
-- 통과했으므로 생성 시각으로 백필하되 과거 약관 동의 시각은 만들어내지 않는다.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

update public.profiles
set onboarding_completed_at = coalesce(created_at, now())
where onboarding_completed_at is null;

alter table public.profiles
  alter column onboarding_completed_at set default now(),
  alter column onboarding_completed_at set not null;

comment on column public.profiles.onboarding_completed_at is
  '닉네임과 필수 약관 처리를 마치고 앱 진입이 가능한 시각';

create table public.user_consents (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null,
  location_version text not null,
  location_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_consents enable row level security;

create policy "user_consents_select_own" on public.user_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_consents_insert_own" on public.user_consents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_consents_update_own" on public.user_consents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2026-08-18 시행 문서에 대한 동의와 프로필을 한 트랜잭션으로 만든다. 함수는
-- 호출자의 RLS를 그대로 적용하고 버전을 인자로 받지 않아 임의 버전 기록을 막는다.
create or replace function public.complete_onboarding(p_nickname text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := btrim(p_nickname);
  v_accepted_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if char_length(v_nickname) < 2 or char_length(v_nickname) > 15 then
    raise exception 'nickname must be between 2 and 15 characters';
  end if;

  insert into public.profiles (id, nickname, onboarding_completed_at)
  values (v_user_id, v_nickname, v_accepted_at);

  insert into public.user_consents (
    user_id,
    terms_version,
    terms_accepted_at,
    privacy_version,
    privacy_accepted_at,
    location_version,
    location_accepted_at
  ) values (
    v_user_id,
    '2026-08-18',
    v_accepted_at,
    '2026-08-18',
    v_accepted_at,
    '2026-08-18',
    v_accepted_at
  );
end;
$$;

revoke all on table public.user_consents from public, anon;
grant select, insert, update on table public.user_consents to authenticated;
grant all on table public.user_consents to service_role;

revoke all on function public.complete_onboarding(text) from public, anon;
grant execute on function public.complete_onboarding(text) to authenticated;

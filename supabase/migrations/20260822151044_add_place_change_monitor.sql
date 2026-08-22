-- 장소 변경 감지는 검토 후보만 만들고 places 자체는 절대 자동 수정하지 않는다.
-- Cron은 비밀 헤더로 Edge Function을 호출하고, 최종 반영은 운영자 승인 뒤 별도
-- 원자적 작업으로 수행한다.

begin;

set local statement_timeout = '120s';

create table public.place_change_monitor_state (
  place_id uuid primary key references public.places(id) on delete restrict,
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  last_result text not null default 'pending',
  last_error text,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint place_change_monitor_state_result_check check (
    last_result in ('pending', 'clean', 'change_detected', 'error')
  ),
  constraint place_change_monitor_state_failures_check check (
    consecutive_failures >= 0
  ),
  constraint place_change_monitor_state_error_check check (
    (last_result = 'error' and last_error is not null)
    or (last_result <> 'error' and last_error is null)
  )
);

comment on table public.place_change_monitor_state is
  '외부 장소 변경 감지의 실행 상태. 장소 운영 상태나 검증 완료 판단과 분리한다.';

create index place_change_monitor_state_due_idx
  on public.place_change_monitor_state(next_check_at);

create table public.place_change_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete restrict,
  fingerprint text not null,
  change_types text[] not null,
  confidence text not null,
  source_provider text not null,
  current_snapshot jsonb not null,
  observed_snapshot jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reported_at timestamptz,
  reviewed_at timestamptz,
  resolution_note text,
  constraint place_change_reviews_fingerprint_check check (
    fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint place_change_reviews_types_check check (
    cardinality(change_types) > 0
    and change_types <@ array[
      'not_found',
      'possible_name_change',
      'name_changed',
      'address_changed',
      'phone_changed',
      'moved'
    ]::text[]
  ),
  constraint place_change_reviews_confidence_check check (
    confidence in ('low', 'medium', 'high')
  ),
  constraint place_change_reviews_provider_check check (
    source_provider = 'kakao'
  ),
  constraint place_change_reviews_current_snapshot_check check (
    jsonb_typeof(current_snapshot) = 'object'
  ),
  constraint place_change_reviews_observed_snapshot_check check (
    jsonb_typeof(observed_snapshot) = 'object'
  ),
  constraint place_change_reviews_evidence_check check (
    jsonb_typeof(evidence) = 'object'
  ),
  constraint place_change_reviews_status_check check (
    status in ('pending', 'superseded', 'dismissed', 'resolved')
  ),
  constraint place_change_reviews_review_check check (
    (status in ('pending', 'superseded') and reviewed_at is null)
    or (status in ('dismissed', 'resolved') and reviewed_at is not null)
  ),
  constraint place_change_reviews_resolution_note_check check (
    resolution_note is null
    or char_length(btrim(resolution_note)) between 1 and 2000
  ),
  unique(place_id, fingerprint)
);

comment on table public.place_change_reviews is
  '외부 공급자에서 감지한 장소 변경 후보. places 반영 권한은 없고 운영자 검토만 기다린다.';

create index place_change_reviews_pending_idx
  on public.place_change_reviews(detected_at, place_id)
  where status = 'pending';

create index place_change_reviews_place_idx
  on public.place_change_reviews(place_id, last_seen_at desc);

alter table public.place_change_monitor_state enable row level security;
alter table public.place_change_reviews enable row level security;

revoke all on table public.place_change_monitor_state
  from public, anon, authenticated, service_role;
revoke all on table public.place_change_reviews
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.place_change_monitor_state to service_role;
grant select, insert, update on table public.place_change_reviews to service_role;

-- 같은 관찰은 한 행으로 합치고, 장소별로 가장 최근의 미검토 후보 하나만 pending으로
-- 유지한다. places는 건드리지 않는 내부 대기열 전용 함수다.
create function public.enqueue_place_change_review(
  p_place_id uuid,
  p_fingerprint text,
  p_change_types text[],
  p_confidence text,
  p_source_provider text,
  p_current_snapshot jsonb,
  p_observed_snapshot jsonb,
  p_evidence jsonb
)
returns table (
  review_id uuid,
  should_report boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.place_change_reviews%rowtype;
  inserted_id uuid;
begin
  select *
  into existing
  from public.place_change_reviews review
  where review.place_id = p_place_id
    and review.fingerprint = p_fingerprint
  for update;

  if found then
    update public.place_change_reviews
    set last_seen_at = now()
    where id = existing.id;

    return query
    select existing.id, existing.status = 'pending' and existing.reported_at is null;
    return;
  end if;

  insert into public.place_change_reviews (
    place_id,
    fingerprint,
    change_types,
    confidence,
    source_provider,
    current_snapshot,
    observed_snapshot,
    evidence
  ) values (
    p_place_id,
    p_fingerprint,
    p_change_types,
    p_confidence,
    p_source_provider,
    p_current_snapshot,
    p_observed_snapshot,
    coalesce(p_evidence, '{}'::jsonb)
  )
  returning id into inserted_id;

  update public.place_change_reviews
  set status = 'superseded'
  where place_id = p_place_id
    and id <> inserted_id
    and status = 'pending';

  return query select inserted_id, true;
end;
$$;

create function public.mark_place_change_review_reported(p_review_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.place_change_reviews
  set reported_at = coalesce(reported_at, now())
  where id = p_review_id
    and status = 'pending';
$$;

revoke all on function public.enqueue_place_change_review(
  uuid, text, text[], text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.enqueue_place_change_review(
  uuid, text, text[], text, text, jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.mark_place_change_review_reported(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_place_change_review_reported(uuid)
  to service_role;

-- Edge Function이 좌표를 포함한 소량의 점검 대상을 15분 동안 선점한다. 동시에
-- 두 작업이 실행돼도 같은 장소를 중복 호출하지 않으며, 작업이 중단되면 다시 풀린다.
create function public.claim_place_change_monitor_batch(p_limit integer default 8)
returns table (
  id uuid,
  name text,
  category text,
  address text,
  phone text,
  latitude double precision,
  longitude double precision,
  source_provider text,
  source_place_id text,
  is_curation_protected boolean
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select p.id
    from public.places p
    left join public.place_change_monitor_state state on state.place_id = p.id
    where p.approved = true
      and p.deleted_at is null
      and coalesce(
        state.next_check_at,
        p.next_verification_at,
        '-infinity'::timestamptz
      ) <= now()
    order by
      coalesce(state.next_check_at, p.next_verification_at, '-infinity'::timestamptz),
      p.is_curation_protected desc,
      p.id
    for update of p skip locked
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
  ), claimed as (
    insert into public.place_change_monitor_state (
      place_id,
      next_check_at,
      last_result,
      last_error,
      updated_at
    )
    select
      due.id,
      now() + interval '15 minutes',
      'pending',
      null,
      now()
    from due
    on conflict (place_id) do update
    set
      next_check_at = excluded.next_check_at,
      last_result = 'pending',
      last_error = null,
      updated_at = now()
    returning place_id
  )
  select
    p.id,
    p.name,
    p.category,
    p.address,
    p.phone,
    public.st_y(p.location::public.geometry) as latitude,
    public.st_x(p.location::public.geometry) as longitude,
    p.source_provider,
    p.source_place_id,
    p.is_curation_protected
  from claimed
  join public.places p on p.id = claimed.place_id
  order by p.id;
$$;

revoke all on function public.claim_place_change_monitor_batch(integer)
  from public, anon, authenticated;
grant execute on function public.claim_place_change_monitor_batch(integer)
  to service_role;

-- 배포 전 검증용 읽기 전용 조회. dry-run은 점검 시각과 재시도 주기까지 전혀
-- 바꾸지 않아야 하므로 선점 함수와 분리한다.
create function public.get_place_change_monitor_batch(p_limit integer default 8)
returns table (
  id uuid,
  name text,
  category text,
  address text,
  phone text,
  latitude double precision,
  longitude double precision,
  source_provider text,
  source_place_id text,
  is_curation_protected boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.category,
    p.address,
    p.phone,
    public.st_y(p.location::public.geometry) as latitude,
    public.st_x(p.location::public.geometry) as longitude,
    p.source_provider,
    p.source_place_id,
    p.is_curation_protected
  from public.places p
  left join public.place_change_monitor_state state on state.place_id = p.id
  where p.approved = true
    and p.deleted_at is null
    and coalesce(
      state.next_check_at,
      p.next_verification_at,
      '-infinity'::timestamptz
    ) <= now()
  order by
    coalesce(state.next_check_at, p.next_verification_at, '-infinity'::timestamptz),
    p.is_curation_protected desc,
    p.id
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke all on function public.get_place_change_monitor_batch(integer)
  from public, anon, authenticated;
grant execute on function public.get_place_change_monitor_batch(integer)
  to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 필요한 Vault 키:
--   place_change_monitor_function_url
--   place_change_monitor_secret
-- 비밀값이 없으면 작업은 조용히 건너뛰며 외부 요청을 보내지 않는다.
select cron.schedule(
  'scan-place-changes-for-review',
  '20 0 * * *', -- 매일 09:20 KST (pg_cron은 UTC)
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'place_change_monitor_function_url'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-place-change-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'place_change_monitor_secret'
        )
      ),
      body := jsonb_build_object('limit', 8),
      timeout_milliseconds := 60000
    )
    where exists (
      select 1
      from vault.decrypted_secrets
      where name = 'place_change_monitor_function_url'
    )
      and exists (
        select 1
        from vault.decrypted_secrets
        where name = 'place_change_monitor_secret'
      )
  $$
);

commit;

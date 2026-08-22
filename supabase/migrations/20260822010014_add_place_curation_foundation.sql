-- 장소 적합성과 영업 상태를 분리해 보수적으로 관리한다.
alter table public.places
  add column relevance_status text not null default 'review',
  add column operational_status text not null default 'unknown',
  add column is_curation_protected boolean not null default false,
  add column last_verified_at timestamptz,
  add column next_verification_at timestamptz;

alter table public.places
  add constraint places_relevance_status_check check (
    relevance_status in ('trusted', 'verified', 'review', 'excluded')
  ),
  add constraint places_operational_status_check check (
    operational_status in (
      'unknown',
      'operational',
      'temporarily_closed',
      'permanently_closed',
      'moved'
    )
  ),
  add constraint places_verification_schedule_check check (
    last_verified_at is null
    or next_verification_at is null
    or next_verification_at >= last_verified_at
  );

comment on column public.places.relevance_status is
  '라이더 장소 적합성. 영업 상태와 독립적으로 관리한다.';
comment on column public.places.operational_status is
  '현재 영업 상태. deleted_at을 변경하기 전 검토 상태도 포함한다.';
comment on column public.places.is_curation_protected is
  '자동 제외·숨김 금지 대상. 상태 변경에는 사람 검토가 필요하다.';
comment on column public.places.last_verified_at is
  '마지막으로 신뢰 가능한 근거를 확인한 시각.';
comment on column public.places.next_verification_at is
  '다음 운영 상태 검증 예정 시각.';

create index places_curation_review_idx
  on public.places (
    is_curation_protected,
    relevance_status,
    operational_status,
    next_verification_at
  )
  where deleted_at is null;

create index places_verification_due_idx
  on public.places (next_verification_at)
  where deleted_at is null
    and next_verification_at is not null
    and operational_status <> 'permanently_closed';

-- 외부 근거 원문과 판단을 분리해 근거를 덮어쓰지 않는다.
create table public.place_curation_evidence (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete restrict,
  source_type text not null,
  signal text not null,
  strength text not null,
  source_name text not null,
  source_url text,
  source_reference text,
  observed_at timestamptz not null,
  details jsonb not null default '{}'::jsonb,
  recorded_by text not null default 'system',
  created_at timestamptz not null default now(),
  constraint place_curation_evidence_id_place_unique unique (id, place_id),
  constraint place_curation_evidence_source_type_check check (
    source_type in (
      'official_registry',
      'official_website',
      'map_provider',
      'social_channel',
      'user_report',
      'manual_review'
    )
  ),
  constraint place_curation_evidence_signal_check check (
    signal in (
      'relevance_confirmed',
      'relevance_rejected',
      'operational',
      'temporarily_closed',
      'permanently_closed',
      'moved',
      'not_found',
      'identity_changed',
      'unknown'
    )
  ),
  constraint place_curation_evidence_strength_check check (
    strength in ('weak', 'medium', 'strong')
  ),
  constraint place_curation_evidence_source_name_check check (
    char_length(btrim(source_name)) between 1 and 200
  ),
  constraint place_curation_evidence_source_url_check check (
    source_url is null or char_length(btrim(source_url)) between 1 and 2048
  ),
  constraint place_curation_evidence_source_reference_check check (
    source_reference is null
    or char_length(btrim(source_reference)) between 1 and 500
  ),
  constraint place_curation_evidence_details_check check (
    jsonb_typeof(details) = 'object'
  ),
  constraint place_curation_evidence_recorded_by_check check (
    char_length(btrim(recorded_by)) between 1 and 100
  )
);

comment on table public.place_curation_evidence is
  '장소 검증에 사용한 외부·수동 근거의 추가 전용 기록.';

create index place_curation_evidence_place_idx
  on public.place_curation_evidence (place_id, observed_at desc, created_at desc);

create index place_curation_evidence_signal_idx
  on public.place_curation_evidence (signal, observed_at desc);

create unique index place_curation_evidence_reference_unique
  on public.place_curation_evidence (
    place_id,
    source_type,
    source_reference,
    observed_at
  )
  where source_reference is not null;

-- 실제 상태 변경은 근거와 별개인 추가 전용 로그로 남긴다.
create table public.place_curation_actions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete restrict,
  evidence_id uuid,
  action_type text not null,
  reason text not null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  acted_by text not null default 'system',
  created_at timestamptz not null default now(),
  constraint place_curation_actions_evidence_place_fkey foreign key (
    evidence_id,
    place_id
  ) references public.place_curation_evidence(id, place_id) on delete restrict,
  constraint place_curation_actions_action_type_check check (
    action_type in (
      'register_place',
      'protect',
      'unprotect',
      'verify_relevance',
      'exclude',
      'queue_review',
      'set_operational_status',
      'soft_hide',
      'restore',
      'update_identity',
      'update_details',
      'defer_review'
    )
  ),
  constraint place_curation_actions_reason_check check (
    char_length(btrim(reason)) between 1 and 2000
  ),
  constraint place_curation_actions_previous_state_check check (
    jsonb_typeof(previous_state) = 'object'
  ),
  constraint place_curation_actions_new_state_check check (
    jsonb_typeof(new_state) = 'object'
  ),
  constraint place_curation_actions_acted_by_check check (
    char_length(btrim(acted_by)) between 1 and 100
  )
);

comment on table public.place_curation_actions is
  '장소 선별·운영 상태 변경의 추가 전용 감사 로그.';

create index place_curation_actions_place_idx
  on public.place_curation_actions (place_id, created_at desc);

create index place_curation_actions_type_idx
  on public.place_curation_actions (action_type, created_at desc);

create unique index place_curation_actions_evidence_type_unique
  on public.place_curation_actions (evidence_id, action_type)
  where evidence_id is not null;

alter table public.place_curation_evidence enable row level security;
alter table public.place_curation_actions enable row level security;

-- 서비스 작업은 조회·추가만 허용해 애플리케이션 경로에서 감사 로그를 수정할 수 없게 한다.
revoke all privileges on table public.place_curation_evidence
  from public, anon, authenticated, service_role;
revoke all privileges on table public.place_curation_actions
  from public, anon, authenticated, service_role;

grant select, insert on table public.place_curation_evidence to service_role;
grant select, insert on table public.place_curation_actions to service_role;

-- 제보자가 운영자 전용 큐레이션 상태를 직접 지정하지 못하게 한다.
drop policy if exists "장소 제보" on public.places;
create policy "장소 제보"
on public.places
for insert
to authenticated
with check (
  (select auth.uid()) = submitted_by
  and approved is false
  and deleted_at is null
  and rejected_reason is null
  and ai_reject_reason is null
  and coalesce(rating, 0) = 0
  and coalesce(review_count, 0) = 0
  and relevance_status = 'review'
  and operational_status = 'unknown'
  and is_curation_protected is false
  and last_verified_at is null
  and next_verification_at is null
);

-- 승인 후 숨긴 장소가 클라이언트에 다시 노출되지 않도록 공개 정책을 보강한다.
drop policy if exists "장소 조회" on public.places;
create policy "장소 조회"
on public.places
for select
to anon, authenticated
using (approved = true and deleted_at is null);

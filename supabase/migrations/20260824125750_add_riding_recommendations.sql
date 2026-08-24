-- 고정 경로형 코스와 분리된 목적지 중심 라이딩 추천과 사용자 제안을 추가한다.
-- 지원 중인 구버전을 위해 courses 및 관련 RPC는 변경하지 않는다.

create table public.riding_guides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  description text not null,
  featured_roads text[] not null default '{}',
  regions text[] not null default '{}',
  tags text[] not null default '{}',
  cover_image_url text,
  legacy_course_id uuid unique references public.courses(id) on delete set null,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint riding_guides_title_check
    check (char_length(btrim(title)) between 2 and 100),
  constraint riding_guides_summary_check
    check (char_length(btrim(summary)) between 5 and 240),
  constraint riding_guides_description_check
    check (char_length(btrim(description)) between 10 and 5000),
  constraint riding_guides_featured_roads_check
    check (cardinality(featured_roads) <= 8),
  constraint riding_guides_regions_check
    check (cardinality(regions) between 1 and 8),
  constraint riding_guides_tags_check
    check (cardinality(tags) <= 12),
  constraint riding_guides_cover_image_url_check
    check (
      cover_image_url is null
      or char_length(btrim(cover_image_url)) between 1 and 2048
    )
);

comment on table public.riding_guides is
  '대표 목적지와 선택적인 들를 곳을 엮는 편집형 라이딩 추천. 고정 경로를 저장하지 않는다.';
comment on column public.riding_guides.featured_roads is
  '추천 도로 이름과 짧은 구간 설명. 경로 계산이나 내비게이션에는 사용하지 않는다.';
comment on column public.riding_guides.legacy_course_id is
  '지원 중인 구 /course/:id 공유 링크를 새 추천으로 연결하기 위한 기존 courses.id';

create index riding_guides_published_idx
  on public.riding_guides(published_at desc)
  where published_at is not null and deleted_at is null;
create index riding_guides_regions_idx
  on public.riding_guides using gin(regions);
create index riding_guides_tags_idx
  on public.riding_guides using gin(tags);

create table public.riding_guide_stops (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.riding_guides(id) on delete cascade,
  position integer not null,
  role text not null,
  place_id uuid references public.places(id) on delete restrict,
  general_place_id uuid references public.general_places(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  constraint riding_guide_stops_position_check
    check (position between 0 and 99),
  constraint riding_guide_stops_role_check
    check (role in ('primary', 'stop')),
  constraint riding_guide_stops_target_check
    check (num_nonnulls(place_id, general_place_id) = 1),
  constraint riding_guide_stops_note_check
    check (note is null or char_length(btrim(note)) between 1 and 500),
  unique (guide_id, position)
);

create unique index riding_guide_stops_one_primary_idx
  on public.riding_guide_stops(guide_id)
  where role = 'primary';
create index riding_guide_stops_place_idx
  on public.riding_guide_stops(place_id)
  where place_id is not null;
create index riding_guide_stops_general_place_idx
  on public.riding_guide_stops(general_place_id)
  where general_place_id is not null;

comment on table public.riding_guide_stops is
  '라이딩 추천에 연결된 대표 목적지와 함께 들를 장소. position은 표시 순서이며 필수 경유 순서가 아니다.';

create table public.riding_guide_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  title text,
  reason text not null,
  featured_roads text[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'pending',
  result_guide_id uuid references public.riding_guides(id) on delete set null,
  rejected_reason text,
  ai_recommendation jsonb,
  ai_judged_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint riding_guide_submissions_title_check
    check (title is null or char_length(btrim(title)) between 2 and 100),
  constraint riding_guide_submissions_reason_check
    check (char_length(btrim(reason)) between 10 and 3000),
  constraint riding_guide_submissions_featured_roads_check
    check (cardinality(featured_roads) <= 8),
  constraint riding_guide_submissions_tags_check
    check (cardinality(tags) <= 12),
  constraint riding_guide_submissions_status_check
    check (status in ('pending', 'editing', 'published', 'merged', 'rejected')),
  constraint riding_guide_submissions_result_check
    check (
      (status in ('published', 'merged') and result_guide_id is not null)
      or (status not in ('published', 'merged'))
    ),
  constraint riding_guide_submissions_rejected_reason_check
    check (
      rejected_reason is null
      or char_length(btrim(rejected_reason)) between 1 and 1000
    )
);

create index riding_guide_submissions_user_idx
  on public.riding_guide_submissions(submitted_by, created_at desc);
create index riding_guide_submissions_pending_idx
  on public.riding_guide_submissions(created_at)
  where status = 'pending';
create index riding_guide_submissions_result_idx
  on public.riding_guide_submissions(result_guide_id)
  where result_guide_id is not null;

comment on table public.riding_guide_submissions is
  '사용자가 보낸 라이딩 추천 제안 원문. 운영자가 다듬어 발행하는 riding_guides와 분리해 보존한다.';

create table public.riding_guide_submission_stops (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.riding_guide_submissions(id) on delete cascade,
  position integer not null,
  role text not null,
  place_id uuid references public.places(id) on delete restrict,
  general_place_id uuid references public.general_places(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  constraint riding_guide_submission_stops_position_check
    check (position between 0 and 7),
  constraint riding_guide_submission_stops_role_check
    check (role in ('primary', 'stop')),
  constraint riding_guide_submission_stops_target_check
    check (num_nonnulls(place_id, general_place_id) = 1),
  constraint riding_guide_submission_stops_note_check
    check (note is null or char_length(btrim(note)) between 1 and 500),
  unique (submission_id, position)
);

create unique index riding_guide_submission_stops_one_primary_idx
  on public.riding_guide_submission_stops(submission_id)
  where role = 'primary';
create index riding_guide_submission_stops_place_idx
  on public.riding_guide_submission_stops(place_id)
  where place_id is not null;
create index riding_guide_submission_stops_general_place_idx
  on public.riding_guide_submission_stops(general_place_id)
  where general_place_id is not null;

comment on table public.riding_guide_submission_stops is
  '사용자가 라이딩 추천에 제안한 대표 목적지와 선택 장소. 장소 정체성은 기존 places/general_places를 사용한다.';

create function private.touch_riding_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger riding_guides_touch_updated_at
before update on public.riding_guides
for each row execute function private.touch_riding_content_updated_at();

create trigger riding_guide_submissions_touch_updated_at
before update on public.riding_guide_submissions
for each row execute function private.touch_riding_content_updated_at();

alter table public.riding_guides enable row level security;
alter table public.riding_guide_stops enable row level security;
alter table public.riding_guide_submissions enable row level security;
alter table public.riding_guide_submission_stops enable row level security;

create policy "공개 라이딩 추천 조회"
on public.riding_guides for select
to anon, authenticated
using (
  published_at is not null
  and published_at <= now()
  and deleted_at is null
);

create policy "공개 라이딩 추천 장소 조회"
on public.riding_guide_stops for select
to anon, authenticated
using (
  exists (
    select 1
    from public.riding_guides guide
    where guide.id = riding_guide_stops.guide_id
      and guide.published_at is not null
      and guide.published_at <= now()
      and guide.deleted_at is null
  )
);

create policy "본인 라이딩 추천 제안 조회"
on public.riding_guide_submissions for select
to authenticated
using ((select auth.uid()) = submitted_by);

create policy "본인 라이딩 추천 제안 생성"
on public.riding_guide_submissions for insert
to authenticated
with check (
  (select auth.uid()) = submitted_by
  and status = 'pending'
  and result_guide_id is null
  and rejected_reason is null
  and ai_recommendation is null
  and ai_judged_at is null
  and reviewed_at is null
);

create policy "본인 라이딩 추천 제안 장소 조회"
on public.riding_guide_submission_stops for select
to authenticated
using (
  exists (
    select 1
    from public.riding_guide_submissions submission
    where submission.id = riding_guide_submission_stops.submission_id
      and submission.submitted_by = (select auth.uid())
  )
);

create policy "본인 라이딩 추천 제안 장소 생성"
on public.riding_guide_submission_stops for insert
to authenticated
with check (
  exists (
    select 1
    from public.riding_guide_submissions submission
    where submission.id = riding_guide_submission_stops.submission_id
      and submission.submitted_by = (select auth.uid())
      and submission.status = 'pending'
  )
);

revoke all on table public.riding_guides from public, anon, authenticated;
revoke all on table public.riding_guide_stops from public, anon, authenticated;
revoke all on table public.riding_guide_submissions from public, anon, authenticated;
revoke all on table public.riding_guide_submission_stops from public, anon, authenticated;

grant select on table public.riding_guides to anon, authenticated;
grant select on table public.riding_guide_stops to anon, authenticated;
grant select, insert on table public.riding_guide_submissions to authenticated;
grant select, insert on table public.riding_guide_submission_stops to authenticated;
grant all on table public.riding_guides to service_role;
grant all on table public.riding_guide_stops to service_role;
grant all on table public.riding_guide_submissions to service_role;
grant all on table public.riding_guide_submission_stops to service_role;

create function public.submit_riding_guide_proposal(
  p_title text,
  p_reason text,
  p_featured_roads text[],
  p_tags text[],
  p_stops jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_submission_id uuid;
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_reason text := btrim(coalesce(p_reason, ''));
  normalized_roads text[];
  normalized_tags text[];
  stop_count integer;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if char_length(normalized_reason) not between 10 and 3000 then
    raise exception 'recommendation reason must be between 10 and 3000 characters';
  end if;

  if normalized_title is not null
    and char_length(normalized_title) not between 2 and 100 then
    raise exception 'title must be between 2 and 100 characters';
  end if;

  select coalesce(array_agg(value order by first_position), '{}')
  into normalized_roads
  from (
    select btrim(value) as value, min(ordinality) as first_position
    from unnest(coalesce(p_featured_roads, '{}')) with ordinality as item(value, ordinality)
    where char_length(btrim(value)) between 1 and 200
    group by btrim(value)
    order by min(ordinality)
    limit 8
  ) road_values;

  select coalesce(array_agg(value order by first_position), '{}')
  into normalized_tags
  from (
    select btrim(value) as value, min(ordinality) as first_position
    from unnest(coalesce(p_tags, '{}')) with ordinality as item(value, ordinality)
    where char_length(btrim(value)) between 1 and 30
    group by btrim(value)
    order by min(ordinality)
    limit 12
  ) tag_values;

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'stops must be an array';
  end if;

  stop_count := jsonb_array_length(p_stops);
  if stop_count not between 1 and 8 then
    raise exception 'stops must contain between 1 and 8 places';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_stops) as stop(
      position integer,
      role text,
      place_id uuid,
      general_place_id uuid,
      note text
    )
    where stop.position is null
      or stop.position not between 0 and 7
      or stop.role not in ('primary', 'stop')
      or num_nonnulls(stop.place_id, stop.general_place_id) <> 1
      or (stop.note is not null and char_length(btrim(stop.note)) not between 1 and 500)
  ) then
    raise exception 'invalid stop';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_stops) as stop(role text)
    where stop.role = 'primary'
  ) <> 1 then
    raise exception 'exactly one primary destination is required';
  end if;

  if (
    select count(distinct stop.position)
    from jsonb_to_recordset(p_stops) as stop(position integer)
  ) <> stop_count then
    raise exception 'stop positions must be unique';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_stops) as stop(place_id uuid, general_place_id uuid)
    left join public.places place on place.id = stop.place_id
    left join public.general_places general on general.id = stop.general_place_id
    where (
      stop.place_id is not null
      and (
        place.id is null
        or place.approved is not true
        or place.deleted_at is not null
      )
    ) or (
      stop.general_place_id is not null
      and general.id is null
    )
  ) then
    raise exception 'one or more places are unavailable';
  end if;

  insert into public.riding_guide_submissions (
    submitted_by,
    title,
    reason,
    featured_roads,
    tags
  ) values (
    current_user_id,
    normalized_title,
    normalized_reason,
    normalized_roads,
    normalized_tags
  )
  returning id into new_submission_id;

  insert into public.riding_guide_submission_stops (
    submission_id,
    position,
    role,
    place_id,
    general_place_id,
    note
  )
  select
    new_submission_id,
    stop.position,
    stop.role,
    stop.place_id,
    stop.general_place_id,
    nullif(btrim(coalesce(stop.note, '')), '')
  from jsonb_to_recordset(p_stops) as stop(
    position integer,
    role text,
    place_id uuid,
    general_place_id uuid,
    note text
  );

  return new_submission_id;
end;
$$;

comment on function public.submit_riding_guide_proposal(text, text, text[], text[], jsonb) is
  '대표 목적지와 선택 장소를 포함한 라이딩 추천 제안을 인증 사용자 소유로 원자적으로 저장한다.';

revoke all on function private.touch_riding_content_updated_at()
  from public, anon, authenticated;
grant execute on function private.touch_riding_content_updated_at()
  to service_role;

revoke all on function public.submit_riding_guide_proposal(text, text, text[], text[], jsonb)
  from public, anon;
grant execute on function public.submit_riding_guide_proposal(text, text, text[], text[], jsonb)
  to authenticated, service_role;

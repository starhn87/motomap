-- 관리자 화면의 수동 상태·PM 추천·감사 로그.
-- 이 파일은 저장소 준비본이다. 원격 적용은 PM 승인 전 금지.
--
-- 롤백: 아래 함수 3개와 테이블 3개를 drop 한다. places 행과 기존 트리거는 바꾸지 않는다.
-- 이미 실행된 승인·반려는 이 drop으로 되돌려지지 않는다.
--
-- 함수는 security invoker다. exposed schema에 security definer를 두지 않는다.
-- PostgREST는 public만 노출하므로, anon/authenticated의 execute를 제거하고 service_role만 남긴다.
-- 호출자는 service_role(RLS 우회)이며 Worker가 그 전에 관리자 세션을 확인한다.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null check (char_length(action) between 1 and 80),
  target_kind text not null check (char_length(target_kind) between 1 and 40),
  target_id uuid,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create table public.admin_manual_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('weekly_cut', 'qa')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  status text not null,
  source text not null default 'manual' check (source = 'manual'),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint admin_manual_items_status_check check (
    (kind = 'weekly_cut' and status in ('done', 'doing', 'waiting'))
    or (kind = 'qa' and status in ('pass', 'fail', 'waiting'))
  )
);

create table public.admin_pm_recommendations (
  target_kind text not null check (
    target_kind in ('place', 'course', 'riding_guide', 'feedback', 'place_change')
  ),
  target_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  source text not null default 'manual' check (source = 'manual'),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (target_kind, target_id)
);

comment on table public.admin_audit_log is
  '관리자 처리의 이전·이후 상태. 장소 본문·연락처는 넣지 않는다.';
comment on table public.admin_manual_items is
  '주간 컷과 QA의 수동 입력. source는 manual만 허용한다.';
comment on table public.admin_pm_recommendations is
  'PM이 직접 남긴 추천. AI 판정 컬럼과 합치지 않는다.';

alter table public.admin_audit_log enable row level security;
alter table public.admin_manual_items enable row level security;
alter table public.admin_pm_recommendations enable row level security;

revoke all on table public.admin_audit_log from public, anon, authenticated;
revoke all on table public.admin_manual_items from public, anon, authenticated;
revoke all on table public.admin_pm_recommendations from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;
grant select, insert, update, delete on table public.admin_manual_items to service_role;
grant select, insert, update, delete on table public.admin_pm_recommendations to service_role;

create or replace function public.apply_admin_place_decision(
  p_place_id uuid,
  p_action text,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.places%rowtype;
  before_state jsonb;
  after_state jsonb;
  written integer;
  next_deleted timestamptz;
  next_reason text;
begin
  if p_actor is null or p_place_id is null or p_action not in ('approve', 'reject') then
    raise exception 'invalid admin place decision' using errcode = '22023';
  end if;

  select * into current_row
  from public.places
  where id = p_place_id
  for update;

  if not found then
    return jsonb_build_object('result', 'missing');
  end if;

  before_state := jsonb_build_object(
    'approved', current_row.approved,
    'deleted_at', current_row.deleted_at,
    'rejected_reason', current_row.rejected_reason
  );

  if current_row.submitted_by is null then
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (p_actor, 'place_not_submission', 'place', p_place_id, before_state, before_state);
    return jsonb_build_object('result', 'not_submission');
  end if;

  if current_row.deleted_at is not null or current_row.approved is true then
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (p_actor, 'place_already_processed', 'place', p_place_id, before_state, before_state);
    return jsonb_build_object(
      'result', 'already_processed',
      'state', case when current_row.deleted_at is not null then 'rejected' else 'approved' end
    );
  end if;

  -- 승인 트리거는 old.approved = false 일 때만 알림을 보낸다. null이면 알림 없이 바뀌므로 거부한다.
  if current_row.approved is distinct from false then
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (p_actor, 'place_not_pending', 'place', p_place_id, before_state, before_state);
    return jsonb_build_object('result', 'not_pending');
  end if;

  if p_action = 'approve' then
    update public.places
      set approved = true
    where id = p_place_id
      and approved = false
      and deleted_at is null
      and submitted_by is not null;
    get diagnostics written = row_count;
    after_state := jsonb_build_object(
      'approved', true,
      'deleted_at', null,
      'rejected_reason', current_row.rejected_reason
    );
  else
    update public.places
      set deleted_at = now(),
          rejected_reason = ai_reject_reason
    where id = p_place_id
      and approved = false
      and deleted_at is null
      and submitted_by is not null
    returning deleted_at, rejected_reason into next_deleted, next_reason;
    get diagnostics written = row_count;
    after_state := jsonb_build_object(
      'approved', false,
      'deleted_at', next_deleted,
      'rejected_reason', next_reason
    );
  end if;

  if written <> 1 then
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (p_actor, 'place_conflict', 'place', p_place_id, before_state, before_state);
    return jsonb_build_object('result', 'conflict');
  end if;

  insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
  values (p_actor, 'place_' || p_action, 'place', p_place_id, before_state, after_state);
  return jsonb_build_object('result', p_action);
end;
$$;

create or replace function public.save_admin_manual_item(
  p_actor uuid,
  p_id uuid,
  p_kind text,
  p_title text,
  p_status text,
  p_remove boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.admin_manual_items%rowtype;
  saved public.admin_manual_items%rowtype;
begin
  if p_actor is null then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if p_remove is true then
    if p_id is null then
      raise exception 'id required' using errcode = '22023';
    end if;
    select * into existing from public.admin_manual_items where id = p_id for update;
    if not found then
      return jsonb_build_object('result', 'missing');
    end if;
    delete from public.admin_manual_items where id = p_id;
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (
      p_actor,
      'manual_remove',
      existing.kind,
      existing.id,
      jsonb_build_object('status', existing.status, 'source', existing.source),
      jsonb_build_object('removed', true)
    );
    return jsonb_build_object('result', 'removed');
  end if;

  if p_id is null then
    insert into public.admin_manual_items (kind, title, status, updated_by)
    values (p_kind, btrim(p_title), p_status, p_actor)
    returning * into saved;
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (
      p_actor,
      'manual_create',
      saved.kind,
      saved.id,
      '{}'::jsonb,
      jsonb_build_object('status', saved.status, 'source', saved.source)
    );
  else
    select * into existing from public.admin_manual_items where id = p_id for update;
    if not found then
      return jsonb_build_object('result', 'missing');
    end if;
    update public.admin_manual_items
      set kind = p_kind,
          title = btrim(p_title),
          status = p_status,
          updated_by = p_actor,
          updated_at = now()
    where id = p_id
    returning * into saved;
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (
      p_actor,
      'manual_update',
      saved.kind,
      saved.id,
      jsonb_build_object('status', existing.status, 'source', existing.source),
      jsonb_build_object('status', saved.status, 'source', saved.source)
    );
  end if;

  return jsonb_build_object(
    'result', 'saved',
    'id', saved.id,
    'updated_at', saved.updated_at,
    'source', saved.source
  );
end;
$$;

create or replace function public.save_admin_pm_recommendation(
  p_actor uuid,
  p_target_kind text,
  p_target_id uuid,
  p_body text,
  p_clear boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.admin_pm_recommendations%rowtype;
  saved public.admin_pm_recommendations%rowtype;
begin
  if p_actor is null or p_target_id is null or p_target_kind not in (
    'place', 'course', 'riding_guide', 'feedback', 'place_change'
  ) then
    raise exception 'invalid pm recommendation' using errcode = '22023';
  end if;

  select * into existing
  from public.admin_pm_recommendations
  where target_kind = p_target_kind and target_id = p_target_id
  for update;

  if p_clear is true then
    if not found then
      return jsonb_build_object('result', 'missing');
    end if;
    delete from public.admin_pm_recommendations
    where target_kind = p_target_kind and target_id = p_target_id;
    insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
    values (
      p_actor,
      'pm_clear',
      p_target_kind,
      p_target_id,
      jsonb_build_object('source', existing.source),
      jsonb_build_object('cleared', true)
    );
    return jsonb_build_object('result', 'cleared');
  end if;

  if found then
    update public.admin_pm_recommendations
      set body = btrim(p_body),
          updated_by = p_actor,
          updated_at = now()
    where target_kind = p_target_kind and target_id = p_target_id
    returning * into saved;
  else
    insert into public.admin_pm_recommendations (target_kind, target_id, body, updated_by)
    values (p_target_kind, p_target_id, btrim(p_body), p_actor)
    returning * into saved;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_kind, target_id, before_state, after_state)
  values (
    p_actor,
    'pm_save',
    p_target_kind,
    p_target_id,
    jsonb_build_object('existed', found, 'source', coalesce(existing.source, 'manual')),
    jsonb_build_object('source', saved.source)
  );
  return jsonb_build_object(
    'result', 'saved',
    'updated_at', saved.updated_at,
    'source', saved.source
  );
end;
$$;

revoke all on function public.apply_admin_place_decision(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.save_admin_manual_item(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.save_admin_pm_recommendation(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.apply_admin_place_decision(uuid, text, uuid) to service_role;
grant execute on function public.save_admin_manual_item(uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.save_admin_pm_recommendation(uuid, text, uuid, text, boolean) to service_role;

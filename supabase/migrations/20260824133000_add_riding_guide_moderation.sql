-- 라이딩 추천 제안에 AI 판정, Discord 준비/반려, 최종 결과 알림을 연결한다.
-- 준비 단계와 실제 공개를 분리해 AI 제안이 검수 없이 공개 콘텐츠가 되지 않게 한다.

alter table public.riding_guide_submissions
  add column reviewed_by text;

alter table public.riding_guide_submissions
  add constraint riding_guide_submissions_reviewed_by_check
  check (
    reviewed_by is null
    or char_length(btrim(reviewed_by)) between 1 and 200
  );

create function public.resolve_riding_guide_submission_review(
  p_submission_id uuid,
  p_action text,
  p_target_guide_id uuid default null,
  p_acted_by text default 'operator'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.riding_guide_submissions%rowtype;
  target_guide public.riding_guides%rowtype;
  primary_name text;
  primary_address text;
  normalized_region text;
  draft_id uuid;
  reject_reason text;
begin
  if p_action not in ('prepare_new', 'prepare_merge', 'reject') then
    raise exception 'unsupported riding guide review action';
  end if;
  if nullif(btrim(coalesce(p_acted_by, '')), '') is null then
    raise exception 'acted_by is required';
  end if;

  select * into submission
  from public.riding_guide_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'riding guide submission not found';
  end if;
  if submission.status <> 'pending' then
    raise exception 'riding guide submission is already reviewed';
  end if;

  if p_action = 'reject' then
    reject_reason := coalesce(
      nullif(btrim(submission.ai_recommendation ->> 'userReason'), ''),
      '검토 결과 이번에는 라이딩 추천에 담기 어려웠어요.'
    );
    update public.riding_guide_submissions
    set status = 'rejected',
        rejected_reason = reject_reason,
        reviewed_at = now(),
        reviewed_by = btrim(p_acted_by)
    where id = submission.id;

    return jsonb_build_object(
      'submissionId', submission.id,
      'submissionTitle', coalesce(submission.title, '라이딩 추천 제안'),
      'status', 'rejected'
    );
  end if;

  if p_action = 'prepare_merge' then
    if p_target_guide_id is null then
      raise exception 'target guide is required';
    end if;
    select * into target_guide
    from public.riding_guides
    where id = p_target_guide_id
      and published_at is not null
      and published_at <= now()
      and deleted_at is null;
    if not found then
      raise exception 'published target guide not found';
    end if;

    update public.riding_guide_submissions
    set status = 'editing',
        result_guide_id = target_guide.id,
        reviewed_at = now(),
        reviewed_by = btrim(p_acted_by)
    where id = submission.id;

    return jsonb_build_object(
      'submissionId', submission.id,
      'submissionTitle', coalesce(submission.title, '라이딩 추천 제안'),
      'status', 'editing',
      'guideId', target_guide.id,
      'guideTitle', target_guide.title,
      'mode', 'merge'
    );
  end if;

  select
    coalesce(place.name, general.name),
    coalesce(place.address, general.address)
  into primary_name, primary_address
  from public.riding_guide_submission_stops stop
  left join public.places place on place.id = stop.place_id
  left join public.general_places general on general.id = stop.general_place_id
  where stop.submission_id = submission.id
    and stop.role = 'primary';

  if primary_name is null then
    raise exception 'primary destination not found';
  end if;

  normalized_region := split_part(btrim(coalesce(primary_address, '')), ' ', 1);
  normalized_region := case normalized_region
    when '서울특별시' then '서울'
    when '부산광역시' then '부산'
    when '대구광역시' then '대구'
    when '인천광역시' then '인천'
    when '광주광역시' then '광주'
    when '대전광역시' then '대전'
    when '울산광역시' then '울산'
    when '세종특별자치시' then '세종'
    when '경기도' then '경기'
    when '강원특별자치도' then '강원'
    when '충청북도' then '충북'
    when '충청남도' then '충남'
    when '전북특별자치도' then '전북'
    when '전라북도' then '전북'
    when '전라남도' then '전남'
    when '경상북도' then '경북'
    when '경상남도' then '경남'
    when '제주특별자치도' then '제주'
    else normalized_region
  end;
  if normalized_region = '' then normalized_region := '전국'; end if;

  insert into public.riding_guides (
    title,
    summary,
    description,
    featured_roads,
    regions,
    tags
  ) values (
    left(coalesce(nullif(btrim(submission.title), ''), primary_name || '으로 가는 라이딩'), 100),
    left(btrim(submission.reason), 240),
    btrim(submission.reason),
    submission.featured_roads,
    array[normalized_region],
    submission.tags
  )
  returning id into draft_id;

  insert into public.riding_guide_stops (
    guide_id,
    position,
    role,
    place_id,
    general_place_id,
    note
  )
  select
    draft_id,
    stop.position,
    stop.role,
    stop.place_id,
    stop.general_place_id,
    stop.note
  from public.riding_guide_submission_stops stop
  where stop.submission_id = submission.id
  order by stop.position;

  update public.riding_guide_submissions
  set status = 'editing',
      result_guide_id = draft_id,
      reviewed_at = now(),
      reviewed_by = btrim(p_acted_by)
  where id = submission.id;

  return jsonb_build_object(
    'submissionId', submission.id,
    'submissionTitle', left(coalesce(submission.title, primary_name || '으로 가는 라이딩'), 100),
    'status', 'editing',
    'guideId', draft_id,
    'guideTitle', left(coalesce(submission.title, primary_name || '으로 가는 라이딩'), 100),
    'mode', 'new'
  );
end;
$$;

comment on function public.resolve_riding_guide_submission_review(uuid, text, uuid, text) is
  '운영자의 라이딩 추천 제안 결정을 원자적으로 반영한다. 새 추천은 비공개 초안으로 만들고 병합은 대상만 확정한다.';

revoke all on function public.resolve_riding_guide_submission_review(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_riding_guide_submission_review(uuid, text, uuid, text)
  to service_role;

create function private.validate_riding_guide_submission_result()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('published', 'merged') and not exists (
    select 1
    from public.riding_guides guide
    where guide.id = new.result_guide_id
      and guide.published_at is not null
      and guide.published_at <= now()
      and guide.deleted_at is null
  ) then
    raise exception 'completed submission must reference a published riding guide';
  end if;
  return new;
end;
$$;

create trigger riding_guide_submission_validate_result
before update of status, result_guide_id on public.riding_guide_submissions
for each row
execute function private.validate_riding_guide_submission_result();

revoke all on function private.validate_riding_guide_submission_result()
  from public, anon, authenticated;
grant execute on function private.validate_riding_guide_submission_result()
  to service_role;

create function private.notify_riding_guide_submission_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guide_title text;
  title_text text;
  body_text text;
  notification_type text;
  notification_id uuid;
  messages jsonb;
  webhook_url text;
begin
  if old.status is not distinct from new.status
    or new.status not in ('published', 'merged', 'rejected') then
    return new;
  end if;

  if new.status = 'rejected' then
    title_text := coalesce(new.title, '라이딩 추천 제안') || '을 검토했어요';
    body_text := coalesce(
      nullif(btrim(new.rejected_reason), ''),
      '검토 결과 이번에는 라이딩 추천에 담기 어려웠어요.'
    );
    notification_type := 'riding_guide_rejected';
  else
    select title into guide_title
    from public.riding_guides
    where id = new.result_guide_id;
    if guide_title is null then
      raise exception 'result guide not found for completed submission';
    end if;
    title_text := '라이딩 추천에 반영됐어요 🎉';
    body_text := public.with_object_josa(guide_title) || ' 이제 모토맵에서 볼 수 있어요!';
    notification_type := 'riding_guide_published';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.submitted_by,
    notification_type,
    title_text,
    body_text,
    case
      when new.status in ('published', 'merged') then
        jsonb_build_object('guideId', new.result_guide_id)
      else null
    end
  )
  returning id into notification_id;

  select jsonb_agg(jsonb_build_object(
    'to', token.token,
    'title', title_text,
    'body', body_text,
    'sound', 'default',
    'data', case
      when new.status in ('published', 'merged') then
        jsonb_build_object(
          'type', notification_type,
          'guideId', new.result_guide_id,
          'notificationId', notification_id
        )
      else
        jsonb_build_object(
          'type', notification_type,
          'notificationId', notification_id
        )
    end
  ))
  into messages
  from public.push_tokens token
  where token.user_id = new.submitted_by;

  if messages is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := messages,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  select decrypted_secret into webhook_url
  from vault.decrypted_secrets
  where name = 'discord_webhook_url';
  if webhook_url is not null then
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object(
        'content',
        case new.status
          when 'rejected' then '🔴 라이딩 추천 제안 반려 완료 — ' || coalesce(new.title, new.id::text)
          when 'merged' then '🟢 라이딩 추천 병합 완료 — ' || guide_title
          else '🟢 라이딩 추천 공개 완료 — ' || guide_title
        end
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  return new;
end;
$$;

create trigger riding_guide_submission_result_notification
after update of status on public.riding_guide_submissions
for each row
execute function private.notify_riding_guide_submission_result();

revoke all on function private.notify_riding_guide_submission_result()
  from public, anon, authenticated;
grant execute on function private.notify_riding_guide_submission_result()
  to service_role;

create trigger riding_guide_submissions_ai_judge
after insert on public.riding_guide_submissions
for each row
when (new.status = 'pending')
execute function public.notify_ai_judge();

create or replace function public.retry_missing_judgements()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
  pending record;
begin
  select decrypted_secret into fn_url
  from vault.decrypted_secrets where name = 'judge_function_url';
  select decrypted_secret into fn_secret
  from vault.decrypted_secrets where name = 'judge_webhook_secret';

  if fn_url is null or fn_secret is null then return; end if;

  for pending in
    select 'places' as table_name, to_jsonb(place) as record
    from public.places place
    where place.approved = false
      and place.deleted_at is null
      and place.ai_reject_reason is null
      and place.created_at < now() - interval '3 minutes'
      and place.created_at > now() - interval '1 hour'
    union all
    select 'courses', to_jsonb(course)
    from public.courses course
    where course.approved = false
      and course.deleted_at is null
      and course.ai_reject_reason is null
      and course.created_at < now() - interval '3 minutes'
      and course.created_at > now() - interval '1 hour'
    union all
    select 'riding_guide_submissions', to_jsonb(submission)
    from public.riding_guide_submissions submission
    where submission.status = 'pending'
      and submission.ai_judged_at is null
      and submission.created_at < now() - interval '3 minutes'
      and submission.created_at > now() - interval '1 hour'
  loop
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object('table', pending.table_name, 'record', pending.record),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-judge-secret', fn_secret
      )
    );
  end loop;
end;
$$;

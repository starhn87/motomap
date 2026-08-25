-- 장소 운영 정보 제보가 승인·반려되면 제보자에게 인앱 알림을 남기고,
-- 등록된 기기가 있으면 Expo 푸시도 보낸다. report ID로 결과 알림을 멱등 처리한다.
create unique index notifications_place_change_report_result_uidx
  on public.notifications ((data ->> 'placeChangeReportId'))
  where type in ('place_change_resolved', 'place_change_dismissed')
    and data ? 'placeChangeReportId';

create or replace function public.notify_place_change_report_result(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.place_change_reports%rowtype;
  place_name text;
  notification_id uuid := gen_random_uuid();
  notification_type text;
  title_text text;
  body_text text;
  notification_data jsonb;
  messages jsonb;
  inserted_count integer;
begin
  select report.*
  into report_row
  from public.place_change_reports report
  where report.id = p_report_id;

  if not found or report_row.status not in ('resolved', 'dismissed') then
    return;
  end if;

  select place.name
  into place_name
  from public.places place
  where place.id = report_row.place_id;

  if not found then
    return;
  end if;

  if report_row.status = 'resolved' then
    notification_type := 'place_change_resolved';
    title_text := place_name || ' 제보가 반영됐어요';
    body_text := case report_row.reason
      when 'temporarily_closed' then
        '알려주신 임시 휴업 정보를 확인해 지도에 표시했어요.'
      when 'reopened' then
        '알려주신 영업 재개 정보를 확인해 정상 운영으로 표시했어요.'
      when 'permanently_closed' then
        '알려주신 폐업 정보를 확인해 지도에서 숨겼어요.'
      when 'moved' then
        '알려주신 이전 정보를 확인해 기존 위치를 지도에서 숨겼어요.'
      else
        '알려주신 장소 정보를 확인해 반영했어요.'
    end;
  else
    notification_type := 'place_change_dismissed';
    title_text := place_name || ' 제보를 검토했어요';
    body_text := '확인 결과 이번에는 장소 정보를 변경하지 않았어요. 제보해주셔서 감사합니다.';
  end if;

  notification_data := jsonb_build_object(
    'notificationId', notification_id,
    'placeChangeReportId', report_row.id
  );

  -- 반영 뒤에도 노출되는 휴업·영업 재개 장소만 상세로 연결한다. 폐업·이전은
  -- 숨겨진 장소로 이동하지 않고 알림 목록에서 처리 결과를 확인하게 한다.
  if report_row.status = 'resolved'
    and report_row.reason in ('temporarily_closed', 'reopened') then
    notification_data := notification_data || jsonb_build_object('placeId', report_row.place_id);
  end if;

  insert into public.notifications (id, user_id, type, title, body, data)
  values (
    notification_id,
    report_row.reporter_id,
    notification_type,
    title_text,
    body_text,
    notification_data
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return;
  end if;

  select jsonb_agg(jsonb_build_object(
    'to', token.token,
    'title', title_text,
    'body', body_text,
    'sound', 'default',
    'data', notification_data || jsonb_build_object('type', notification_type)
  ))
  into messages
  from public.push_tokens token
  where token.user_id = report_row.reporter_id;

  if messages is null then
    return;
  end if;

  -- 푸시는 부가 전달 경로다. Expo 요청 등록 실패가 장소 상태 반영과 인앱 알림을
  -- 되돌리지는 않게 하고, 인앱 알림을 최종 기준으로 유지한다.
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := messages,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
end;
$$;

comment on function public.notify_place_change_report_result(uuid) is
  '처리 완료된 사용자 장소 변경 제보의 인앱 알림을 한 번만 기록하고 Expo 푸시를 시도한다.';

revoke all on function public.notify_place_change_report_result(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.notify_place_change_report_result(uuid)
  to service_role;

create or replace function public.notify_place_change_report_result_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_place_change_report_result(new.id);
  return new;
end;
$$;

revoke all on function public.notify_place_change_report_result_on_update()
  from public, anon, authenticated, service_role;

create trigger notify_place_change_report_result_after_update
after update of status on public.place_change_reports
for each row
when (
  old.status = 'pending'
  and new.status in ('resolved', 'dismissed')
)
execute function public.notify_place_change_report_result_on_update();

-- 기능 배포 직후 알림 없이 처리된 제보도 보완한다. 같은 사용자·장소에서 휴업 후
-- 곧바로 영업 재개처럼 결과가 연속된 경우에는 모순된 옛 푸시를 여러 건 보내지 않고
-- 가장 최근 결과만 알린다.
do $$
declare
  report_id uuid;
begin
  for report_id in
    select ranked.id
    from (
      select
        report.id,
        row_number() over (
          partition by report.reporter_id, report.place_id
          order by report.resolved_at desc nulls last, report.created_at desc
        ) as result_order
      from public.place_change_reports report
      where report.status in ('resolved', 'dismissed')
        and not exists (
          select 1
          from public.notifications notification
          where notification.data ->> 'placeChangeReportId' = report.id::text
        )
    ) ranked
    where ranked.result_order = 1
  loop
    perform public.notify_place_change_report_result(report_id);
  end loop;
end;
$$;

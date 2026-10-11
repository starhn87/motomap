begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 신규 기록 저장 설정은 위치 이용 재동의·자료 파기와 별개다.
create function location_private.set_history_enabled(p_enabled boolean,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject location_private.subjects%rowtype;
begin
  if auth.uid() is null or p_actor is distinct from auth.uid() or p_enabled is null then
    raise exception 'authenticated owner and explicit setting required';
  end if;
  select * into v_subject from location_private.subjects where user_id=auth.uid() for update;
  if v_subject.id is null or v_subject.status<>'active' or v_subject.version<>'2026-10-11-location-v2' then
    raise exception 'active location consent required';
  end if;
  update location_private.subjects set history_allowed=p_enabled where id=v_subject.id;
  return location_private.control('status',null,jsonb_build_object('expectedActor',p_actor));
end $$;
revoke all on function location_private.set_history_enabled(boolean,uuid) from public,anon;
grant execute on function location_private.set_history_enabled(boolean,uuid) to authenticated;
create function public.set_location_history_enabled(p_enabled boolean,p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select location_private.set_history_enabled(p_enabled,p_actor);
$$;
revoke all on function public.set_location_history_enabled(boolean,uuid) from public,anon;
grant execute on function public.set_location_history_enabled(boolean,uuid) to authenticated;
commit;

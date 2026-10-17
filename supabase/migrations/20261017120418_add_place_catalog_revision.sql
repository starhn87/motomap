begin;

-- 공개 장소의 실제 내용 변경만 추적한다. 검사 시각 갱신은 클라이언트를 깨우지 않는다.
create schema if not exists place_catalog_private;
revoke all on schema place_catalog_private from public, anon, authenticated;
create table place_catalog_private.revision (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 1
);
insert into place_catalog_private.revision(singleton) values (true);
alter table place_catalog_private.revision enable row level security;

create function place_catalog_private.track_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if TG_OP <> 'INSERT' then before_row := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then after_row := to_jsonb(NEW); end if;
  -- 운영 검증 메타데이터와 비공개 제출 내용은 공개 카탈로그 변경이 아니다.
  if not (coalesce((before_row->>'approved')::boolean, false)
      or coalesce((after_row->>'approved')::boolean, false)) then return null; end if;
  if (before_row - array['last_verified_at','next_verification_at','relevance_status',
      'is_curation_protected','rejected_reason','ai_reject_reason'])
      is not distinct from
     (after_row - array['last_verified_at','next_verification_at','relevance_status',
      'is_curation_protected','rejected_reason','ai_reject_reason']) then return null; end if;
  update place_catalog_private.revision set revision = revision + 1 where singleton;
  return null;
end;
$$;
revoke all on function place_catalog_private.track_change() from public;
create trigger track_place_catalog_change after insert or update or delete on public.places
for each row execute function place_catalog_private.track_change();

-- 기존 API 1 RPC 응답은 유지한다. 검토·제보·사용자 정보는 공개하지 않는다.
create function public.get_place_catalog_revision() returns text
language sql stable security definer set search_path = '' as $$
  select revision::text from place_catalog_private.revision where singleton;
$$;
revoke all on function public.get_place_catalog_revision() from public;
grant execute on function public.get_place_catalog_revision() to anon, authenticated, service_role;

-- 이전 후 공급자 ID가 바뀌어도 옛 장소 ID의 재등장을 막는다. 이름으로 차단하지 않는다.
create table place_catalog_private.suppressed_sources (
  provider text not null,
  provider_id text not null,
  primary key(provider, provider_id)
);
alter table place_catalog_private.suppressed_sources enable row level security;
insert into place_catalog_private.suppressed_sources(provider,provider_id)
select distinct source_provider,source_place_id from public.places
where approved and deleted_at is not null and operational_status in ('permanently_closed','moved')
  and source_provider is not null and nullif(source_place_id,'') is not null
on conflict do nothing;
insert into place_catalog_private.suppressed_sources(provider,provider_id)
select distinct g.provider,g.provider_place_id from public.general_places g
join public.places p on p.id=g.promoted_place_id
where p.approved and p.deleted_at is not null and p.operational_status in ('permanently_closed','moved')
  and g.provider <> 'coordinate' and nullif(g.provider_place_id,'') is not null
on conflict do nothing;

create function place_catalog_private.track_suppression() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if NEW.approved and NEW.deleted_at is not null
      and NEW.operational_status in ('permanently_closed','moved') then
    insert into place_catalog_private.suppressed_sources(provider,provider_id)
    select NEW.source_provider,NEW.source_place_id
    where NEW.source_provider is not null and nullif(NEW.source_place_id,'') is not null
    union
    select g.provider,g.provider_place_id from public.general_places g
    where g.promoted_place_id=NEW.id and g.provider <> 'coordinate' and nullif(g.provider_place_id,'') is not null
    on conflict do nothing;
  elsif NEW.approved and NEW.deleted_at is null then
    -- 같은 ID의 영업 재개만 해제한다. 다른 ID로 이전한 옛 지점은 유지한다.
    delete from place_catalog_private.suppressed_sources s
    where ((s.provider=NEW.source_provider and s.provider_id=NEW.source_place_id)
      or (NEW.source_place_id is null and exists (select 1 from public.general_places g
        where g.promoted_place_id=NEW.id and g.provider=s.provider and g.provider_place_id=s.provider_id)))
      and not exists (select 1 from public.places p where p.id<>NEW.id and p.approved
        and p.deleted_at is not null and p.operational_status in ('permanently_closed','moved')
        and ((p.source_provider=s.provider and p.source_place_id=s.provider_id)
          or exists (select 1 from public.general_places g where g.promoted_place_id=p.id
            and g.provider=s.provider and g.provider_place_id=s.provider_id)));
  end if;
  return null;
end;
$$;
revoke all on function place_catalog_private.track_suppression() from public;
create trigger track_place_catalog_suppression after insert or update on public.places
for each row execute function place_catalog_private.track_suppression();
create function public.get_place_catalog_suppressions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'providerId',provider_id)
    order by provider,provider_id),'[]'::jsonb) from place_catalog_private.suppressed_sources;
$$;
revoke all on function public.get_place_catalog_suppressions() from public;
grant execute on function public.get_place_catalog_suppressions() to anon, authenticated, service_role;

create function place_catalog_private.track_general_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if NEW.promoted_place_id is null or NEW.provider='coordinate'
      or nullif(NEW.provider_place_id,'') is null then return null; end if;
  -- 폐업 여부를 읽기 전 직렬화해 동시 폐업·공급자 연결의 억제 누락을 피한다.
  perform 1 from place_catalog_private.revision where singleton for update;
  if exists(select 1 from public.places p where p.id=NEW.promoted_place_id and p.approved
      and p.deleted_at is not null and p.operational_status in ('permanently_closed','moved')) then
    insert into place_catalog_private.suppressed_sources(provider,provider_id)
    values(NEW.provider,NEW.provider_place_id) on conflict do nothing;
    if found then
      update place_catalog_private.revision set revision=revision+1 where singleton;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function place_catalog_private.track_general_source() from public;
create trigger track_general_place_catalog_source after insert or update of provider,provider_place_id,promoted_place_id
on public.general_places for each row execute function place_catalog_private.track_general_source();

commit;

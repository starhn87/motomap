-- 길안내 지도 전용 최소 필드 조회. 기존 RPC/쓰기/공개 카탈로그 기준은 유지한다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create function public.guide_places_in_viewport(
  p_south double precision, p_west double precision,
  p_north double precision, p_east double precision,
  p_after_id uuid default null, p_limit integer default 250
)
returns table(id uuid, name text, address text, category text, latitude double precision,
  longitude double precision, source_provider text, source_place_id text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_south is null or p_west is null or p_north is null or p_east is null
     or not (p_south >= -90 and p_north <= 90 and p_south < p_north
       and p_west >= -180 and p_east <= 180 and p_west < p_east
       and p_north-p_south <= 2 and p_east-p_west <= 2)
     or p_limit is null or p_limit < 1 or p_limit > 251 then
    raise exception 'invalid viewport or page size' using errcode = '22023';
  end if;
  return query select p.id,p.name,p.address,p.category,
    public.st_y(p.location::public.geometry),public.st_x(p.location::public.geometry),
    p.source_provider,p.source_place_id
  from public.places p
  where p.approved = true and p.deleted_at is null
    and (p_after_id is null or p.id > p_after_id)
    and p.location operator(public.&&) public.st_makeenvelope(p_west,p_south,p_east,p_north,4326)::public.geography
    and public.st_y(p.location::public.geometry) between p_south and p_north
    and public.st_x(p.location::public.geometry) between p_west and p_east
  order by p.id limit p_limit;
end;
$$;
revoke all on function public.guide_places_in_viewport(double precision,double precision,double precision,double precision,uuid,integer) from public;
grant execute on function public.guide_places_in_viewport(double precision,double precision,double precision,double precision,uuid,integer) to anon,authenticated;

-- user_id 인자를 받지 않으며 invoker RLS와 본인 조건을 함께 적용한다.
create function public.guide_map_favorites(p_after_id uuid default null, p_limit integer default 250)
returns table(id uuid, place_id uuid, general_place_id uuid, name text, address text,
  category text, latitude double precision, longitude double precision,
  source_provider text, source_place_id text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 251 then
    raise exception 'invalid page size' using errcode = '22023';
  end if;
  return query select f.id,f.place_id,f.general_place_id,
    case when f.place_id is not null then p.name else coalesce(g.name,f.name) end,
    case when f.place_id is not null then p.address else coalesce(g.address,f.address,'') end,
    case when f.place_id is not null then p.category else null::text end,
    case when f.place_id is not null then public.st_y(p.location::public.geometry) else coalesce(g.latitude,f.latitude) end,
    case when f.place_id is not null then public.st_x(p.location::public.geometry) else coalesce(g.longitude,f.longitude) end,
    case when f.place_id is not null then p.source_provider else g.provider end,
    case when f.place_id is not null then p.source_place_id else g.provider_place_id end
  from public.favorites f
  left join public.places p on p.id=f.place_id and p.approved=true and p.deleted_at is null
  left join public.general_places g on g.id=f.general_place_id
  where f.user_id=(select auth.uid()) and (p_after_id is null or f.id > p_after_id)
    and (f.place_id is null or p.id is not null)
  order by f.id limit p_limit;
end;
$$;
revoke all on function public.guide_map_favorites(uuid,integer) from public,anon;
grant execute on function public.guide_map_favorites(uuid,integer) to authenticated;
commit;

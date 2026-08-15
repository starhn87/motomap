-- 공개 위험 정보에는 제보자 UUID가 필요하지 않다. 원본 테이블은 제보자 본인만
-- 조회·수정하고, 공개 조회는 식별자를 뺀 view/RPC로만 제공한다.

drop function if exists public.hazards_near_course(uuid, integer);
drop function if exists public.nearby_hazards(double precision, double precision, integer);
drop view if exists public.live_road_hazards;

drop policy if exists "road_hazards 조회는 누구나" on public.road_hazards;
drop policy if exists "road_hazards 조회는 제보자만" on public.road_hazards;
create policy "road_hazards 조회는 제보자만" on public.road_hazards
  for select
  to authenticated
  using ((select auth.uid()) = reported_by);

drop policy if exists "road_hazards 제보는 로그인 사용자" on public.road_hazards;
create policy "road_hazards 제보는 로그인 사용자" on public.road_hazards
  for insert
  to authenticated
  with check ((select auth.uid()) = reported_by);

drop policy if exists "road_hazards 수정은 본인만" on public.road_hazards;
create policy "road_hazards 수정은 본인만" on public.road_hazards
  for update
  to authenticated
  using ((select auth.uid()) = reported_by)
  with check ((select auth.uid()) = reported_by);

-- view는 의도적으로 공개하는 안전한 열만 가진다. 기본 security definer 동작으로
-- 원본 테이블 RLS를 우회하므로 reported_by를 절대 포함하지 않는다.
create view public.live_road_hazards as
  select
    h.id,
    h.location,
    h.type,
    h.note,
    h.photo,
    h.address,
    h.created_at,
    h.last_confirmed_at,
    h.confirm_count,
    h.resolved_count,
    h.deleted_at,
    st_y(h.location::geometry) as latitude,
    st_x(h.location::geometry) as longitude,
    case
      when h.last_confirmed_at > now() - (public.hazard_fresh_days(h.type) || ' days')::interval
      then 0 else 1
    end as staleness
  from public.road_hazards h
  where h.deleted_at is null
    and h.resolved_count < 2
    and h.last_confirmed_at > now() - (public.hazard_fresh_days(h.type) * 2 || ' days')::interval;

revoke all on public.live_road_hazards from public;
grant select on public.live_road_hazards to anon, authenticated, service_role;

create function public.nearby_hazards(
  lat double precision,
  lng double precision,
  radius_meters integer default 20000
)
returns table(
  id uuid,
  type text,
  note text,
  photo text,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  last_confirmed_at timestamptz,
  confirm_count integer,
  resolved_count integer,
  staleness integer
)
language sql
stable
set search_path = ''
as $$
  select
    h.id, h.type, h.note, h.photo, h.address,
    h.latitude, h.longitude,
    h.created_at, h.last_confirmed_at,
    h.confirm_count, h.resolved_count, h.staleness
  from public.live_road_hazards h
  where public.st_dwithin(
    h.location,
    public.st_makepoint(lng, lat)::public.geography,
    radius_meters
  )
  order by public.st_distance(
    h.location,
    public.st_makepoint(lng, lat)::public.geography
  );
$$;

revoke all on function public.nearby_hazards(double precision, double precision, integer) from public;
grant execute on function public.nearby_hazards(double precision, double precision, integer)
  to anon, authenticated, service_role;

create function public.hazards_near_course(
  course_id uuid,
  radius_m integer default 500
)
returns table(
  id uuid,
  type text,
  note text,
  photo text,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  last_confirmed_at timestamptz,
  confirm_count integer,
  resolved_count integer,
  staleness integer,
  route_fraction double precision
)
language sql
stable
set search_path = ''
as $$
  with course_line as (
    select public.st_setsrid(
      public.st_makeline(array(
        select public.st_makepoint((pt->>0)::float8, (pt->>1)::float8)
        from jsonb_array_elements(coalesce(c.route_geometry, c.coordinates)) as pt
      )),
      4326
    ) as line
    from public.courses c
    where c.id = course_id
  )
  select
    h.id, h.type, h.note, h.photo, h.address,
    h.latitude, h.longitude,
    h.created_at, h.last_confirmed_at,
    h.confirm_count, h.resolved_count, h.staleness,
    public.st_linelocatepoint(cl.line, h.location::public.geometry) as route_fraction
  from public.live_road_hazards h, course_line cl
  where public.st_dwithin(h.location, cl.line::public.geography, radius_m)
  order by route_fraction;
$$;

revoke all on function public.hazards_near_course(uuid, integer) from public;
grant execute on function public.hazards_near_course(uuid, integer)
  to anon, authenticated, service_role;

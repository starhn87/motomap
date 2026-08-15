-- 클라이언트가 매 검색마다 전체 장소·코스 테이블을 내려받지 않도록 관련성·지역
-- 범위 판정을 DB에서 끝낸다. p_term_groups는 낱말별 동의어 배열이다.

create or replace function public.search_places_v2(
  p_query text,
  p_term_groups jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_meters integer default 20000,
  p_near_only boolean default false,
  p_limit integer default 50
)
returns table(
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  address text,
  phone text,
  photos text[],
  rating numeric,
  review_count integer,
  tags text[],
  opening_hours text,
  hours jsonb,
  parking_info text,
  submitted_by uuid,
  approved boolean,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with input as (
    select
      regexp_replace(lower(btrim(coalesce(p_query, ''))), '[[:space:]·._-]+', '', 'g') as q,
      case
        when jsonb_typeof(p_term_groups) = 'array' then p_term_groups
        else '[]'::jsonb
      end as groups,
      case
        when p_lat is not null and p_lng is not null
          then public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography
        else null::public.geography
      end as anchor
  ), candidates as (
    select
      p.*,
      public.st_y(p.location::public.geometry) as latitude,
      public.st_x(p.location::public.geometry) as longitude,
      case when i.anchor is null then null else public.st_distance(p.location, i.anchor) end as distance_m,
      case
        when text_data.compact_name = i.q then 100
        when text_data.compact_name like i.q || '%' then 90
        when text_data.compact_name like '%' || i.q || '%' then 80
        when text_data.compact_tags = i.q then 70
        when text_data.compact_tags like '%' || i.q || '%' then 60
        when text_data.compact_category = i.q then 55
        when text_data.compact_address like '%' || i.q || '%' then 45
        else 35
      end as search_score
    from public.places p
    cross join input i
    cross join lateral (
      select
        regexp_replace(lower(p.name), '[[:space:]·._-]+', '', 'g') as compact_name,
        regexp_replace(lower(p.address), '[[:space:]·._-]+', '', 'g') as compact_address,
        regexp_replace(lower(array_to_string(coalesce(p.tags, '{}'::text[]), ' ')), '[[:space:]·._-]+', '', 'g') as compact_tags,
        regexp_replace(lower(case p.category
          when 'cafe' then '카페'
          when 'restaurant' then '맛집 식당'
          when 'rest_stop' then '휴게소'
          when 'gas_station' then '주유소'
          when 'repair_shop' then '바이크사 정비 수리'
          when 'viewpoint' then '뷰포인트 전망'
          when 'gear_shop' then '용품점'
          when 'camping' then '캠핑'
          when 'car_wash' then '세차'
          else p.category
        end), '[[:space:]·._-]+', '', 'g') as compact_category,
        regexp_replace(lower(concat_ws(' ',
          p.name,
          p.address,
          array_to_string(coalesce(p.tags, '{}'::text[]), ' '),
          case p.category
            when 'cafe' then '카페'
            when 'restaurant' then '맛집 식당'
            when 'rest_stop' then '휴게소'
            when 'gas_station' then '주유소'
            when 'repair_shop' then '바이크사 정비 수리'
            when 'viewpoint' then '뷰포인트 전망'
            when 'gear_shop' then '용품점'
            when 'camping' then '캠핑'
            when 'car_wash' then '세차'
            else p.category
          end
        )), '[[:space:]·._-]+', '', 'g') as haystack
    ) text_data
    where p.approved = true
      and p.deleted_at is null
      and (
        i.q = '' or not exists (
          select 1
          from jsonb_array_elements(i.groups) word_group
          where not exists (
            select 1
            from jsonb_array_elements_text(word_group) alternative
            where text_data.haystack like '%' || alternative || '%'
          )
        )
      )
  ), scoped as (
    select c.*,
      coalesce(bool_or(c.distance_m <= p_radius_meters) over (), false) as has_near
    from candidates c
  )
  select
    s.id, s.name, s.description, s.category,
    s.latitude, s.longitude, s.address, s.phone, s.photos,
    s.rating, s.review_count, s.tags, s.opening_hours, s.hours,
    s.parking_info, s.submitted_by, s.approved, s.created_at
  from scoped s
  where s.distance_m is null
     or (p_near_only and s.distance_m <= p_radius_meters)
     or (not p_near_only and (not s.has_near or s.distance_m <= p_radius_meters))
  order by s.search_score desc, s.distance_m asc nulls last, s.rating desc, s.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.search_courses_v2(
  p_query text,
  p_term_groups jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_meters integer default 20000,
  p_near_only boolean default false,
  p_limit integer default 30
)
returns table(
  id uuid,
  name text,
  description text,
  distance numeric,
  duration integer,
  difficulty text,
  coordinates jsonb,
  waypoint_ids uuid[],
  created_by uuid,
  rating numeric,
  review_count integer,
  tags text[],
  created_at timestamptz,
  section_from text,
  section_to text,
  route_name text,
  route_geometry jsonb
)
language sql
stable
set search_path = ''
as $$
  with input as (
    select
      regexp_replace(lower(btrim(coalesce(p_query, ''))), '[[:space:]·._-]+', '', 'g') as q,
      case
        when jsonb_typeof(p_term_groups) = 'array' then p_term_groups
        else '[]'::jsonb
      end as groups,
      case
        when p_lat is not null and p_lng is not null
          then public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography
        else null::public.geography
      end as anchor
  ), candidates as (
    select
      c.*,
      case
        when i.anchor is null or jsonb_array_length(c.coordinates) = 0 then null
        else public.st_distance(
          public.st_setsrid(public.st_makepoint(
            (c.coordinates->0->>0)::double precision,
            (c.coordinates->0->>1)::double precision
          ), 4326)::public.geography,
          i.anchor
        )
      end as distance_m,
      case
        when text_data.compact_name = i.q then 100
        when text_data.compact_name like i.q || '%' then 90
        when text_data.compact_name like '%' || i.q || '%' then 80
        when text_data.compact_tags = i.q then 70
        when text_data.compact_tags like '%' || i.q || '%' then 60
        else 35
      end as search_score
    from public.courses c
    cross join input i
    cross join lateral (
      select
        regexp_replace(lower(c.name), '[[:space:]·._-]+', '', 'g') as compact_name,
        regexp_replace(lower(array_to_string(coalesce(c.tags, '{}'::text[]), ' ')), '[[:space:]·._-]+', '', 'g') as compact_tags,
        regexp_replace(lower(concat_ws(' ',
          c.name,
          c.description,
          array_to_string(coalesce(c.tags, '{}'::text[]), ' '),
          c.section_from,
          c.section_to,
          c.route_name
        )), '[[:space:]·._-]+', '', 'g') as haystack
    ) text_data
    where c.approved = true
      and c.deleted_at is null
      and (
        i.q = '' or not exists (
          select 1
          from jsonb_array_elements(i.groups) word_group
          where not exists (
            select 1
            from jsonb_array_elements_text(word_group) alternative
            where text_data.haystack like '%' || alternative || '%'
          )
        )
      )
  ), scoped as (
    select c.*,
      coalesce(bool_or(c.distance_m <= p_radius_meters) over (), false) as has_near
    from candidates c
  )
  select
    s.id, s.name, s.description, s.distance, s.duration, s.difficulty,
    s.coordinates, s.waypoint_ids, s.created_by, s.rating, s.review_count,
    s.tags, s.created_at, s.section_from, s.section_to, s.route_name, s.route_geometry
  from scoped s
  where s.distance_m is null
     or (p_near_only and s.distance_m <= p_radius_meters)
     or (not p_near_only and (not s.has_near or s.distance_m <= p_radius_meters))
  order by s.search_score desc, s.distance_m asc nulls last, s.rating desc, s.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.search_places_v2(text, jsonb, double precision, double precision, integer, boolean, integer) from public;
revoke all on function public.search_courses_v2(text, jsonb, double precision, double precision, integer, boolean, integer) from public;
grant execute on function public.search_places_v2(text, jsonb, double precision, double precision, integer, boolean, integer) to anon, authenticated, service_role;
grant execute on function public.search_courses_v2(text, jsonb, double precision, double precision, integer, boolean, integer) to anon, authenticated, service_role;

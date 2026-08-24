-- 지원 중인 앱이 쓰는 search_courses_v2는 유지하고, 신버전이 목적지 중심
-- 라이딩 추천만 검색할 수 있는 별도 계약을 추가한다.

create function public.search_riding_guides_v1(
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
  title text,
  summary text,
  featured_roads text[],
  regions text[],
  tags text[],
  cover_image_url text,
  published_at timestamptz,
  primary_latitude double precision,
  primary_longitude double precision
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
      guide.*,
      coalesce(
        public.st_y(primary_place.location::public.geometry),
        primary_general.latitude
      ) as primary_latitude,
      coalesce(
        public.st_x(primary_place.location::public.geometry),
        primary_general.longitude
      ) as primary_longitude,
      case
        when input.anchor is null then null
        else public.st_distance(
          coalesce(
            primary_place.location,
            public.st_setsrid(
              public.st_makepoint(primary_general.longitude, primary_general.latitude),
              4326
            )::public.geography
          ),
          input.anchor
        )
      end as distance_m,
      case
        when text_data.compact_title = input.q then 100
        when text_data.compact_title like input.q || '%' then 90
        when text_data.compact_title like '%' || input.q || '%' then 80
        when text_data.compact_tags = input.q then 70
        when text_data.compact_tags like '%' || input.q || '%' then 60
        when text_data.compact_regions like '%' || input.q || '%' then 55
        else 35
      end as search_score
    from public.riding_guides guide
    join public.riding_guide_stops primary_stop
      on primary_stop.guide_id = guide.id
      and primary_stop.role = 'primary'
    left join public.places primary_place on primary_place.id = primary_stop.place_id
    left join public.general_places primary_general
      on primary_general.id = primary_stop.general_place_id
    cross join input
    cross join lateral (
      select
        regexp_replace(lower(guide.title), '[[:space:]·._-]+', '', 'g') as compact_title,
        regexp_replace(
          lower(array_to_string(coalesce(guide.tags, '{}'::text[]), ' ')),
          '[[:space:]·._-]+',
          '',
          'g'
        ) as compact_tags,
        regexp_replace(
          lower(array_to_string(coalesce(guide.regions, '{}'::text[]), ' ')),
          '[[:space:]·._-]+',
          '',
          'g'
        ) as compact_regions,
        regexp_replace(lower(concat_ws(
          ' ',
          guide.title,
          guide.summary,
          guide.description,
          array_to_string(coalesce(guide.featured_roads, '{}'::text[]), ' '),
          array_to_string(coalesce(guide.regions, '{}'::text[]), ' '),
          array_to_string(coalesce(guide.tags, '{}'::text[]), ' '),
          (
            select string_agg(coalesce(place.name, general.name), ' ' order by stop.position)
            from public.riding_guide_stops stop
            left join public.places place on place.id = stop.place_id
            left join public.general_places general on general.id = stop.general_place_id
            where stop.guide_id = guide.id
          )
        )), '[[:space:]·._-]+', '', 'g') as haystack
    ) text_data
    where guide.published_at is not null
      and guide.published_at <= now()
      and guide.deleted_at is null
      and (
        input.q = '' or not exists (
          select 1
          from jsonb_array_elements(input.groups) word_group
          where not exists (
            select 1
            from jsonb_array_elements_text(word_group) alternative
            where text_data.haystack like '%' || alternative || '%'
          )
        )
      )
  ), scoped as (
    select candidate.*,
      coalesce(bool_or(candidate.distance_m <= p_radius_meters) over (), false) as has_near
    from candidates candidate
  )
  select
    scoped.id,
    scoped.title,
    scoped.summary,
    scoped.featured_roads,
    scoped.regions,
    scoped.tags,
    scoped.cover_image_url,
    scoped.published_at,
    scoped.primary_latitude,
    scoped.primary_longitude
  from scoped
  where scoped.distance_m is null
     or (p_near_only and scoped.distance_m <= p_radius_meters)
     or (
       not p_near_only
       and (not scoped.has_near or scoped.distance_m <= p_radius_meters)
     )
  order by
    scoped.search_score desc,
    scoped.distance_m asc nulls last,
    scoped.published_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

comment on function public.search_riding_guides_v1(
  text,
  jsonb,
  double precision,
  double precision,
  integer,
  boolean,
  integer
) is '공개 라이딩 추천을 대표 목적지 주변과 편집 문구 기준으로 검색한다.';

revoke all on function public.search_riding_guides_v1(
  text,
  jsonb,
  double precision,
  double precision,
  integer,
  boolean,
  integer
) from public;
grant execute on function public.search_riding_guides_v1(
  text,
  jsonb,
  double precision,
  double precision,
  integer,
  boolean,
  integer
) to anon, authenticated, service_role;

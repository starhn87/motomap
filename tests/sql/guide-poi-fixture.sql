create extension postgis;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table public.places(id uuid primary key,name text,address text,category text,location geography(point,4326),approved boolean,deleted_at timestamptz,source_provider text,source_place_id text);
create index places_location_idx on public.places using gist(location);
create table public.general_places(id uuid primary key,name text,address text,latitude double precision,longitude double precision,provider text,provider_place_id text);
create table public.favorites(id uuid primary key,user_id uuid,place_id uuid,general_place_id uuid,name text,address text,latitude double precision,longitude double precision);
alter table public.places enable row level security;
alter table public.general_places enable row level security;
alter table public.favorites enable row level security;
create policy visible_places on public.places for select to anon,authenticated using(approved and deleted_at is null);
create policy public_general_places on public.general_places for select to anon,authenticated using(true);
create policy own_favorites on public.favorites for select to authenticated using(user_id=(select auth.uid()));
grant select on public.places,public.general_places,public.favorites to anon,authenticated;
insert into public.places values
 ('00000000-0000-0000-0000-000000000001','공개 카페','검사 주소','cafe',st_point(127,37.5,4326)::geography,true,null,'kakao','1'),
 ('00000000-0000-0000-0000-000000000002','삭제 카페','검사 주소','cafe',st_point(127,37.5,4326)::geography,true,now(),'kakao','2'),
 ('00000000-0000-0000-0000-000000000003','미승인 카페','검사 주소','cafe',st_point(127,37.5,4326)::geography,false,null,'kakao','3'),
 ('00000000-0000-0000-0000-000000000004','영역 밖','검사 주소','cafe',st_point(128,38.5,4326)::geography,true,null,'kakao','4'),
 ('00000000-0000-0000-0000-000000000005','공개 정비소','검사 주소','repair_shop',st_point(127.001,37.501,4326)::geography,true,null,'kakao','5');
insert into public.favorites values
 ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001',null,null,null,null,null),
 ('10000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',null,null,'기존 일반 저장 장소','검사 주소',37.5,127),
 ('10000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000004',null,null,null,null,null),
 ('10000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000002',null,null,null,null,null);

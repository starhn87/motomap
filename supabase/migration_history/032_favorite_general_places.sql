-- 등록되지 않은 일반 장소도 즐겨찾기할 수 있게 한다.
--
-- 라이더 특화 장소가 아니어도 사람마다 자주 가는 곳이 있다. 지금은 집·회사
-- 두 칸(기기 로컬)뿐이라 그 외에는 담아둘 자리가 없었다.
--
-- 테이블을 새로 파지 않고 favorites 를 넓힌 이유: 즐겨찾기 목록·지도 별 마커·
-- 별 토글이 다섯 군데에서 이 테이블을 읽는다. 나누면 그 다섯 곳마다 두 소스를
-- 합치는 코드가 생긴다.
--
-- 등록 장소는 place_id 로, 일반 장소는 이름+좌표로 식별한다.

alter table public.favorites
  alter column place_id drop not null,
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists phone text;

-- 둘 중 하나여야 한다 — 등록 장소이거나, 좌표를 가진 일반 장소이거나.
alter table public.favorites
  drop constraint if exists favorites_target_check;

alter table public.favorites
  add constraint favorites_target_check check (
    (place_id is not null
      and latitude is null and longitude is null and name is null)
    or
    (place_id is null
      and latitude is not null and longitude is not null and name is not null)
  );

-- 같은 곳을 두 번 담지 않게. 좌표는 부동소수라 그대로 비교하면 안 걸리므로
-- 5자리(약 1m)로 반올림해 맞춘다. 등록 장소의 유니크는 기존 제약이 맡는다.
create unique index if not exists favorites_general_unique
  on public.favorites (
    user_id,
    round(latitude::numeric, 5),
    round(longitude::numeric, 5)
  )
  where place_id is null;

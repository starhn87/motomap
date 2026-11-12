-- 탈퇴 선처리가 profiles 행을 삭제할 때 동기화한 집·회사도 삭제한다.
create table public.account_personal_places (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot text not null check (slot in ('home', 'work')),
  -- 삭제한 슬롯의 null 행은 옛 기기 값이 그 자리를 되살리지 않게 한다.
  place jsonb,
  primary key (user_id, slot),
  constraint valid_personal_place check (place is null or (
    octet_length(place::text) <= 4096 and
    place - array['name', 'address', 'latitude', 'longitude'] = '{}'::jsonb and
    jsonb_path_match(place, 'strict $.type() == "object" && $.name.type() == "string" && $.address.type() == "string" && $.latitude.type() == "number" && $.latitude >= -90 && $.latitude <= 90 && $.longitude.type() == "number" && $.longitude >= -180 && $.longitude <= 180', '{}', true) is true
  ))
);

alter table public.account_personal_places enable row level security;
revoke all on public.account_personal_places from public, anon, authenticated;
grant select, insert, update on public.account_personal_places to authenticated;

create policy own_personal_places on public.account_personal_places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

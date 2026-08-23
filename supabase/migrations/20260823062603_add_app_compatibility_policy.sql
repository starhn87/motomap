-- 앱 바이너리·OTA와 백엔드가 서로 다른 속도로 배포되어도 구버전을 안전하게
-- 안내하기 위한 공개 읽기 전용 정책. 운영 변경은 service_role만 수행한다.
create table public.app_compatibility_policy (
  platform text primary key check (platform in ('ios', 'android')),
  latest_version text not null check (latest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  recommended_version text not null check (recommended_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  minimum_supported_version text not null check (minimum_supported_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  update_message text not null default '더 안정적인 모토맵을 사용하려면 업데이트해 주세요.',
  store_url text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_compatibility_policy is
  '앱 버전별 권장·최소 지원 정책. 클라이언트는 읽기만 하고 운영자는 service_role로 변경한다.';

alter table public.app_compatibility_policy enable row level security;

revoke all on table public.app_compatibility_policy from public, anon, authenticated;
grant select on table public.app_compatibility_policy to anon, authenticated;
grant all on table public.app_compatibility_policy to service_role;

create policy "Anyone can read app compatibility policy"
  on public.app_compatibility_policy
  for select
  to anon, authenticated
  using (true);

insert into public.app_compatibility_policy (
  platform,
  latest_version,
  recommended_version,
  minimum_supported_version,
  update_message,
  store_url
) values (
  'ios',
  '1.2.6',
  '1.2.6',
  '1.2.4',
  '최신 기능과 안정성 개선을 이용하려면 업데이트해 주세요.',
  'https://apps.apple.com/kr/app/id6773636183'
);

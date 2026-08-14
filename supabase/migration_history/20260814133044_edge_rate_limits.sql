-- 외부 유료 API를 호출하는 Edge Function의 고정 윈도우 호출 제한.
-- 원문 IP나 user_id는 저장하지 않고, 함수에서 HMAC 처리한 키만 보관한다.
-- public 스키마에 두되 클라이언트 권한은 전부 회수하고 service_role만 사용한다.

create table public.edge_rate_limits (
  scope text not null check (char_length(scope) between 1 and 80),
  key_hash text not null check (char_length(key_hash) = 64),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

alter table public.edge_rate_limits enable row level security;

revoke all on table public.edge_rate_limits from public, anon, authenticated;
grant select, insert, update on table public.edge_rate_limits to service_role;

-- 같은 키의 동시 요청도 INSERT ... ON CONFLICT의 행 잠금 안에서 한 번씩 센다.
-- SECURITY INVOKER로 두고 service_role에만 실행 권한을 줘 RLS 우회를 숨기지 않는다.
create or replace function public.consume_edge_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language sql
volatile
security invoker
set search_path = ''
as $$
  with consumed as (
    insert into public.edge_rate_limits (
      scope,
      key_hash,
      window_started_at,
      request_count,
      updated_at
    )
    values (btrim(p_scope), btrim(p_key_hash), now(), 1, now())
    on conflict (scope, key_hash) do update
    set
      window_started_at = case
        when public.edge_rate_limits.window_started_at
          <= now() - make_interval(secs => greatest(p_window_seconds, 1))
          then now()
        else public.edge_rate_limits.window_started_at
      end,
      request_count = case
        when public.edge_rate_limits.window_started_at
          <= now() - make_interval(secs => greatest(p_window_seconds, 1))
          then 1
        else public.edge_rate_limits.request_count + 1
      end,
      updated_at = now()
    returning request_count, window_started_at
  )
  select
    consumed.request_count <= greatest(p_limit, 1),
    case
      when consumed.request_count <= greatest(p_limit, 1) then 0
      else greatest(
        1,
        ceil(extract(epoch from (
          consumed.window_started_at
          + make_interval(secs => greatest(p_window_seconds, 1))
          - now()
        )))::integer
      )
    end
  from consumed;
$$;

revoke execute on function public.consume_edge_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.edge_rate_limits is
  '외부 유료 API Edge Function 호출 제한. 요청자 식별자는 서버에서 HMAC 처리한다.';

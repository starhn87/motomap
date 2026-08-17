-- 미등록 목적지는 주거지처럼 민감한 위치일 수 있다. 운영 후보를 찾기 위한
-- 집계 함수지만 SECURITY DEFINER라 공개 역할이 실행하면 RLS를 우회하므로,
-- Data API의 공개 역할에서는 완전히 닫고 service_role 운영에만 남긴다.
revoke execute on function public.unregistered_ride_spots(integer)
  from public, anon, authenticated;

grant execute on function public.unregistered_ride_spots(integer)
  to service_role;

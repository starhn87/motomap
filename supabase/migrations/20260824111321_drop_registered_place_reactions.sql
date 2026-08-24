-- 1.2.7 TestFlight에서 시험한 등록 장소 좋아요와 인기 순위를 철회한다.
-- 일반 장소 추천은 별도 general_place_shares 계약이므로 그대로 유지한다.

drop function if exists public.top_recommended_places(integer);
drop function if exists public.toggle_place_recommendation(uuid);
drop function if exists public.get_place_recommendation(uuid);

drop function if exists private.top_recommended_places(integer);
drop function if exists private.toggle_place_recommendation(uuid);
drop function if exists private.get_place_recommendation(uuid);

drop trigger if exists place_recommendations_refresh_summary
  on public.place_recommendations;
drop function if exists private.refresh_place_recommendation_summary();

-- TestFlight 전용 반응 데이터도 기능과 함께 제거한다.
drop table public.place_recommendations;

alter table public.places
  drop constraint if exists places_recommendation_count_check,
  drop column recommendation_count,
  drop column last_recommended_at;

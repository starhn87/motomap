-- vote_hazard 가 "hazard_id is ambiguous" 로 실패하던 것 수정.
-- 파라미터 이름이 hazard_votes.hazard_id 컬럼과 같아, ON CONFLICT (hazard_id, user_id)
-- 처럼 한정자를 붙일 수 없는 자리에서 PostgreSQL 이 어느 쪽인지 판단하지 못했다.
-- 파라미터에 p_ 접두사를 붙여 충돌 자체를 없앤다.
--
-- 파라미터명이 바뀌므로 CREATE OR REPLACE 로는 교체되지 않아 먼저 DROP 한다.

DROP FUNCTION IF EXISTS public.vote_hazard(uuid, text);

CREATE FUNCTION public.vote_hazard(p_hazard_id uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  previous text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_kind NOT IN ('confirm', 'resolve') THEN
    RAISE EXCEPTION '잘못된 값입니다.';
  END IF;

  SELECT kind INTO previous FROM hazard_votes
   WHERE hazard_id = p_hazard_id AND user_id = auth.uid();

  IF previous = p_kind THEN
    RETURN; -- 같은 표 반복은 무시
  END IF;

  INSERT INTO hazard_votes (hazard_id, user_id, kind)
  VALUES (p_hazard_id, auth.uid(), p_kind)
  ON CONFLICT (hazard_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now();

  -- 이전 표 되돌리기
  IF previous = 'confirm' THEN
    UPDATE road_hazards SET confirm_count = GREATEST(confirm_count - 1, 0)
     WHERE id = p_hazard_id;
  ELSIF previous = 'resolve' THEN
    UPDATE road_hazards SET resolved_count = GREATEST(resolved_count - 1, 0)
     WHERE id = p_hazard_id;
  END IF;

  IF p_kind = 'confirm' THEN
    UPDATE road_hazards
       SET confirm_count = confirm_count + 1, last_confirmed_at = now()
     WHERE id = p_hazard_id;
  ELSE
    UPDATE road_hazards SET resolved_count = resolved_count + 1
     WHERE id = p_hazard_id;
  END IF;
END;
$function$;

-- 027 의 두 함수가 `set search_path = ''` 라 좋아요 시 42P01 로 실패하던 것 수정.
--
-- 빈 search_path 는 함수 안에서 스키마를 다 붙이면 안전하지만, 이 함수들은
-- reviews 를 UPDATE 하고 그 테이블에는 기존 트리거(평점 집계 등)가 걸려 있다.
-- 트리거가 호출하는 함수는 호출자의 search_path 를 물려받으므로, 스키마를 안 붙인
-- 기존 함수가 `places` 를 못 찾고 터졌다. public 으로 고정해 체인 전체가 살게 한다.

CREATE OR REPLACE FUNCTION public.sync_review_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET like_count = like_count + 1 WHERE id = NEW.review_id;
    RETURN NEW;
  ELSE
    UPDATE public.reviews SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.review_id;
    RETURN OLD;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_review_liked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  review_row record;
  place_name text;
  liker_name text;
  body_text text;
  messages jsonb;
BEGIN
  SELECT r.user_id, r.place_id INTO review_row
  FROM public.reviews r WHERE r.id = NEW.review_id;

  IF review_row.user_id IS NULL OR review_row.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO place_name FROM public.places p WHERE p.id = review_row.place_id;
  SELECT COALESCE(pr.nickname, '라이더') INTO liker_name
  FROM public.profiles pr WHERE pr.id = NEW.user_id;

  body_text := liker_name || '님이 ' || COALESCE(place_name, '장소') || ' 리뷰를 좋아합니다.';

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    review_row.user_id,
    'review_liked',
    '내 리뷰에 좋아요가 달렸어요',
    body_text,
    jsonb_build_object('placeId', review_row.place_id, 'reviewId', NEW.review_id)
  );

  SELECT jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '내 리뷰에 좋아요가 달렸어요',
    'body', body_text,
    'sound', 'default',
    'data', jsonb_build_object(
      'type', 'review_liked',
      'placeId', review_row.place_id,
      'reviewId', NEW.review_id
    )
  ))
  INTO messages
  FROM public.push_tokens t
  WHERE t.user_id = review_row.user_id;

  IF messages IS NULL THEN
    RETURN NEW; -- 토큰 없음 — 앱 내 알림만 남는다
  END IF;

  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NEW;
END;
$function$;

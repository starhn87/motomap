-- 리뷰 좋아요(따봉) + 받은 사람에게 알림·푸시.
-- 리뷰를 쓴 사람이 반응을 받는 유일한 통로라, 리뷰를 남길 이유를 만들어 준다.
--
-- like_count 를 reviews 에 두는 이유: 목록에서 리뷰마다 count 쿼리를 돌리면
-- 화면 하나에 수십 번이 나간다. 트리거로 세어 두고 읽기는 컬럼에서 한다.

CREATE TABLE IF NOT EXISTS public.review_likes (
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;

-- 누가 눌렀는지는 공개 정보가 아니지만, 내가 눌렀는지는 알아야 버튼 상태를 그린다.
DROP POLICY IF EXISTS "review_likes 조회는 본인 것만" ON public.review_likes;
CREATE POLICY "review_likes 조회는 본인 것만" ON public.review_likes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_likes 추가는 본인만" ON public.review_likes;
CREATE POLICY "review_likes 추가는 본인만" ON public.review_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_likes 해제는 본인만" ON public.review_likes;
CREATE POLICY "review_likes 해제는 본인만" ON public.review_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 카운터 유지
CREATE OR REPLACE FUNCTION public.sync_review_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
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

DROP TRIGGER IF EXISTS review_likes_count ON public.review_likes;
CREATE TRIGGER review_likes_count
  AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_review_like_count();

-- 좋아요를 받으면 리뷰 작성자에게 알림 + 푸시.
-- 자기 리뷰에 자기가 누른 경우는 보내지 않는다.
CREATE OR REPLACE FUNCTION public.notify_review_liked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
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

DROP TRIGGER IF EXISTS review_likes_notify ON public.review_likes;
CREATE TRIGGER review_likes_notify
  AFTER INSERT ON public.review_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_review_liked();

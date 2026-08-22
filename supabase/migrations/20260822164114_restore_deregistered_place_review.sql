-- 등록 해제 당시 숨긴 원래 장소에 남겨둔 티하우스에덴 리뷰를
-- 같은 일반 장소로 옮긴다. 리뷰 본문·사진·작성일·좋아요와 UUID는 건드리지 않는다.
do $$
declare
  v_hidden_place_id constant uuid := 'e66e697d-c276-47f4-8cfb-4d022b4b698a';
  v_general_place_id constant uuid := 'b6fd4211-01e9-4df8-98b2-8780a35da53c';
  v_review_id constant uuid := 'af4252c7-8bde-43ab-9cf7-ff186dda5050';
  matching_count integer;
  moved_count integer;
begin
  perform 1
  from public.places p
  where p.id = v_hidden_place_id
    and p.name = '티하우스에덴'
    and p.address = '경기 이천시 마장면 서이천로 449-79'
    and p.deleted_at = '2026-08-22T05:57:41.000Z'::timestamptz
    and p.rating = 5
    and p.review_count = 1
  for update;

  if not found then
    raise exception '티하우스에덴의 숨김 장소 상태가 감사 스냅샷과 다릅니다.';
  end if;

  perform 1
  from public.general_places gp
  where gp.id = v_general_place_id
    and gp.provider = 'coordinate'
    and gp.provider_place_id = '티하우스에덴|37.26183,127.39544'
    and gp.name = '티하우스에덴'
    and gp.address = '경기 이천시 마장면 서이천로 449-79'
    and gp.promoted_place_id is null
    and gp.rating = 0
    and gp.review_count = 0
  for update;

  if not found then
    raise exception '티하우스에덴의 일반 장소 상태가 감사 스냅샷과 다릅니다.';
  end if;

  select count(*)
  into matching_count
  from public.reviews r
  where r.place_id = v_hidden_place_id;

  if matching_count <> 1 then
    raise exception '숨김 장소의 리뷰 수가 예상값 1과 다릅니다: %', matching_count;
  end if;

  perform 1
  from public.reviews r
  where r.id = v_review_id
    and r.place_id = v_hidden_place_id
    and r.general_place_id is null
  for update;

  if not found then
    raise exception '보정할 티하우스에덴 리뷰가 예상 대상에 연결돼 있지 않습니다.';
  end if;

  update public.reviews r
  set
    place_id = null,
    general_place_id = v_general_place_id
  where r.id = v_review_id
    and r.place_id = v_hidden_place_id
    and r.general_place_id is null;

  get diagnostics moved_count = row_count;
  if moved_count <> 1 then
    raise exception '리뷰 보정 행 수가 예상값 1과 다릅니다: %', moved_count;
  end if;

  if not exists (
    select 1
    from public.places p
    where p.id = v_hidden_place_id
      and p.rating = 0
      and p.review_count = 0
  ) then
    raise exception '숨김 장소의 리뷰 집계가 0으로 갱신되지 않았습니다.';
  end if;

  if not exists (
    select 1
    from public.general_places gp
    where gp.id = v_general_place_id
      and gp.rating = 5
      and gp.review_count = 1
  ) then
    raise exception '일반 장소의 리뷰 집계가 별점 5, 리뷰 1건으로 갱신되지 않았습니다.';
  end if;
end;
$$;

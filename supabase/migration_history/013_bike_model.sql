-- 마이 바이크 프로필 — 기종 자기 신고 (인증 없음).
-- 리뷰에 "OO 라이더" 뱃지로 표시되어 어떤 바이크 관점의 평인지 보여준다.

alter table public.profiles add column if not exists bike_model text;

# Archived migration history

이 디렉터리의 SQL은 2026-08-14 운영 스키마 기준선 이전의 변경 이력이다.
Supabase CLI가 실행하는 활성 마이그레이션이 아니며, 새 환경에서는
`../migrations/20260814142438_remote_schema_baseline.sql`만 적용한다.

- 기존 `001`~`038`과 `20260814133044_edge_rate_limits.sql`의 결과는 기준선에 모두 포함돼 있다.
- 과거 변경의 의도와 검토 맥락을 남기기 위해 파일을 삭제하지 않고 보존한다.
- 이 파일들을 `migrations/`로 되돌리면 기준선과 객체가 중복되므로 다시 옮기지 않는다.
- 이후 스키마 변경은 `supabase migration new <name>`으로 `migrations/`에 추가한다.

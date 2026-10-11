# 재개 DB 점검과 승인된 정비 적용 기록

2026-10-11 운영 프로젝트를 **읽기 전용**으로 확인했다. 이 기록은 운영 변경·전체 보안 검증
완료 보고가 아니다. Supabase·Postgres 스킬의 최소 권한/짧은 트랜잭션 기준과 실제 함수
정의·카탈로그를 대조했으며 사용자 데이터·GPS 원문·키·토큰은 반출하지 않았다.

## 확인 결과

| 대상 | 실제 확인 | 판정·후속 |
|---|---|---|
| 과거 `public.rides` | 0행·0사용자, 생성 기간 없음 | RIDE-004의 제거 대상. 장소 도착 기록과 별개 |
| 계정 삭제 선처리 | `prepare_account_deletion(uuid)`만 과거 테이블 참조. service_role 실행, 일반 역할 차단 | 해당 한 줄 제거 후 테이블 제거 준비 |
| 과거 테이블 의존성 | 자체 타입·TOAST·정책·기본값·인덱스·제약만 확인 | CASCADE 없이 제거. 함수 문자열 참조는 별도 검사 |
| 자동 작업 | AI 판정 재시도·미완료 계정 정리·장소 변경 검토 모두 inactive | 그대로 유지, 재개하지 않음 |
| 관리 캐시 정리 | `purge_google_place_hours()`는 SECURITY DEFINER, anon/authenticated 실행 가능 | 서버 전용으로 제한 준비. 실제 정리 함수 미호출 |
| 공개 위험 뷰 | `live_road_hazards`는 security_invoker=true | 이 설정 유지. 정책·함수별 세부 검증은 별도 |

### Advisor 경고의 구분

현재 경고는 복구 기록과 같은 범주다. 개수만으로 실제 데이터 유출이나 앱 결함으로 단정하지 않는다.

- RLS 없는 `spatial_ref_sys` 1개: 확장 소유·공간 함수 의존성과 권한을 더 대조한다.
  [점검 안내](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)
- search_path 미설정 5개: `update_course_rating`, `with_object_josa`, `places_near_course`,
  `all_places`, `nearby_places`. 본문의 테이블·공간 타입/함수 스키마와 trigger 영향을 확인한 뒤
  별도로 정비한다. [점검 안내](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- public 확장 2개(PostGIS·pg_net): 기존 공간 RPC·타입·웹훅 의존성이 있어 일괄 이전하지 않는다.
  [점검 안내](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
- anon/authenticated SECURITY DEFINER 경고 19/24개: 일부는 trigger/event_trigger,
  일부는 의도된 공개 장소 집계·auth.uid 기반 본인 통계다. 일반 인자 RPC인지·실제 역할별
  접근을 대조한다. 확인된 관리 캐시 함수만 이번 제한안에 포함한다.
  [anon 안내](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [로그인 역할 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- RLS 정책 없는 11개: 관리·캐시·Edge 전용 의도를 포함한다. GRANT가 있어도 RLS에 정책이
  없으면 일반 역할의 행 읽기는 차단된다. 직접 읽기 허용 정책을 무조건 추가하지 않는다.
  [점검 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- 유출 비밀번호 보호 비활성 1개: 플랜·비용·설정·로그인 회귀를 확인하고 별도 승인받는다.
  [공식 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## 승인 전 준비한 변경안 — 아래 적용 후속과 구분

1. `20261011030530_drop_unused_legacy_rides.sql`
   - 테이블 잠금 뒤 0행·계정 삭제 함수의 예상 본문 지문을 재검증한다.
   - 기존 계정 삭제 선처리의 `public.rides` 삭제 한 줄만 제거하고 기존 service_role 권한을 유지한다.
   - `public.rides`만 CASCADE 없이 제거한다. `place_rides`, 리뷰·즐겨찾기와 다른 사용자 기록은
     이 마이그레이션에서 삭제·변경하지 않는다. 계정 삭제 함수 자체도 실행하지 않는다.
   - 테이블 부재·공개/비공개 함수의 잔여 문자열 참조·서버 전용 실행 권한을 사후 검증한다.
2. `20261011030532_restrict_maintenance_cache_cleanup.sql`
   - 예상 캐시 함수 본문 지문을 검사한 뒤 스키마를 명시하고 search_path를 비운다.
   - PUBLIC/anon/authenticated 실행을 제거하고 service_role 실행만 유지한다.
   - 기존 ‘30일 초과 캐시’ 조건은 그대로다. 정리 함수를 호출하지 않으므로 캐시 행을 즉시 지우지 않는다.

두 파일은 CLI 2.120.0의 migration new로 생성했으며 앱 의존성·lockfile·공용 CLI 설치는 변경하지
않았다. 운영 적용 명령은 실행하지 않았다. 3초 lock timeout·30초 statement timeout과 트랜잭션을
두었고 예상 데이터/본문이 바뀌면 전체 작업을 중단한다.

## 검증 경계와 다음 순서

정비 SQL의 **소스 계약 테스트 4개**는 기존 계정 삭제 본문의 한 줄 변경·대상 테이블 한정·
CASCADE 금지·설정/권한 검증·캐시 함수 미호출을 확인한다. SQL을 실제 Postgres에서 실행한
결과는 아니며 운영 마이그레이션·계정 삭제 회귀 완료로 확대 해석하지 않는다.
전체 자동 테스트는 **98개 통과·실패 0**이며 타입 검사·릴리스 계약 검사·diff 검사도 통과했다.

승인 후 각각 적용하기 직전에 0행·본문·권한을 다시 확인한다. 적용 후에는 테이블 부재와 실제
권한·Advisor, 생성 타입을 대조하고 공개 장소 읽기·서버 계정 삭제 경로를 검증한다. 삭제 RPC를
실행하는 검증에는 별도 허용한 테스트 계정만 쓰며 운영자 실사용 계정은 삭제하지 않는다.
파기 증빙에는 적용 시각·마이그레이션과 비식별 집계만 남긴다. 백업/PITR 보존기간은 별도로
확정하며 과거 백업 복원 시 동일 파기를 다시 수행한다(RIDE-004).

원격 적용 뒤 생성 타입을 갱신한다. 적용 전 `lib/database.types.ts`에서 테이블을 제거해 실제 DB와
다르게 표시하지 않는다. 기존 내부 앱의 정상 기능 확인과 수정본의 정적 검증·SQL 준비를 구분한다.
외부 공급자 나머지 장애 경계, Storage/Edge/RLS 세부 검사, 개인정보·약관·심사 경로는 남아 있다.

## 같은 날 사용자 승인 후 실제 적용·검증

사용자가 DB 정비 2건의 적용·검증을 승인했다. 준비한 SQL 원문만 순서대로 적용했고 운영 공개
상태·지도 공급자·자동 작업·Auth 설정·DB 버전/확장은 추가 변경하지 않았다.

| 변경 | 실제 운영 이력 | 적용·검증 시각(KST) |
|---|---|---|
| 과거 GPS 테이블 제거 | `20261011031348_drop_unused_legacy_rides` | 2026-10-11 12:13, 첫 사후 검증 12:13:57 |
| 관리 캐시 함수 권한 제한 | `20261011031406_restrict_maintenance_cache_cleanup` | 2026-10-11 12:14, 최종 검증 12:14:42 |

MCP 적용 도구가 실제 적용 시각으로 이력 버전을 부여하므로 준비 파일의 `20261011030530`과
`20261011030532`를 각각 위 실제 버전으로 이름만 변경했다. SQL 내용은 바꾸지 않았으며
`supabase_migrations.schema_migrations.statements`와 로컬 파일 원문의 지문이 일치했다.
과거의 다른 이력 차이는 이 승인과 무관하므로 일괄 migration repair/db push하지 않았다.

### 보존 확인

서버 안에서 전체 행을 정렬해 계산한 체크섬과 건수를 적용 전·1차 후·2차 후 대조했다.
원문 사용자/사진/좌표·체크섬 값은 보고서·저장소에 남기지 않는다.

| 데이터 | 적용 전 | 적용 후 | 전체 행 내용 체크섬 |
|---|---:|---:|---|
| 리뷰 | 16 | 16 | 일치 |
| 즐겨찾기 | 18 | 18 | 일치 |
| 장소 방문 기록 | 39 | 39 | 일치 |
| 영업시간 캐시 | 771 | 771 | 일치 |

- 제거 직전 `public.rides`는 0행·0사용자였다. 테이블 부재와 공개/비공개 함수의 잔여 참조
  0개를 확인했다. `place_rides` 등 보존 대상에는 DML을 실행하지 않았다.
- 계정 삭제 함수 본문은 기존 한 줄 제거와 일치했다. anon/authenticated 실행은 차단,
  service_role 실행은 유지했고 캐시 함수도 같은 역할별 권한·빈 search_path를 확인했다.
  계정 삭제·캐시 정리 함수를 실제 실행하지 않았으므로 이 두 작업의 실동작 회귀는 별도다.
- Advisor의 anon/authenticated SECURITY DEFINER 경고가 **19/24 → 18/23**으로 줄었고
  캐시 정리 함수는 두 목록에서 빠졌다. 다른 경고는 그대로며 전체 보안 검증 완료는 아니다.
- 정지한 cron 3개는 최종 확인에서도 inactive다. 재개하지 않았다.

### 실제 Data API 읽기·타입 검증

앱과 동일한 Supabase 클라이언트·기존 공개 키로 세션을 만들지 않고 확인했다.
`all_places`: 200/120개, 고정된 공개 서울 좌표의 `nearby_places`: 200/6개, 리뷰 읽기: 200,
익명 favorites/place_rides 읽기: 200/0개. 제거된 rides endpoint는 404/PGRST205다.
공개 키를 수동 Authorization에 넣은 진단·루트 OpenAPI 접근은 401이었다. 앱 클라이언트의
정상 조회와 구분하며 OpenAPI 루트 차단을 앱 조회 오류로 집계하지 않는다.

MCP 생성 타입의 PostgrestVersion은 기존 14.17과 다른 14.5였으므로 저장소에 고정한 CLI
2.115.0으로 다시 생성·대조했다. CLI도 14.5를 반환했고 스키마/타입은 동일해 해당 생성값을
사용했다. REST 루트에서 서버 버전 조회가 성공한 것으로 표시하지 않는다. 레거시 테이블 타입은
실제 제거 후에만 삭제했고 본인 장소 기록 RPC 등 기존 계약은 유지한다. 앱/runtime 1.2.8,
native/API 계약 1을 바꾸지 않았다. 자동 테스트 **98개 통과·실패 0**, 타입 검사·릴리스 계약
검사·모든 Edge Function의 Deno check·diff 검사를 통과했다.

파기 완료 표시는 **운영 테이블**에 한정한다. 백업/PITR 설정과 보존기간은 미확인으로 남겨두며
과거 사본까지 삭제됐다고 표시하지 않는다. 백업을 복원할 때 RIDE-004를 다시 적용해야 한다.
푸시·빌드·TestFlight/App Store·OTA·웹 공개 배포·운영 재개·사용자 알림은 하지 않았다.

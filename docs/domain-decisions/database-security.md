# DB 공개 권한과 재개 정비

## DBSEC-001 — Advisor 경고는 실제 공개 계약에 대조하고 관리 동작만 최소 권한으로 제한한다

- 날짜: 2026-10-11
- 상태: 승인된 관리 캐시 권한 정비 적용·검증 완료 / 기타 보안 항목 대기
- 관련 기록: RIDE-004, OPS-003, `docs/reports/relaunch-database-security-2026-10-11.md`
- 관련 구현: `supabase/migrations/20261011031406_restrict_maintenance_cache_cleanup.sql`

### 결정

- 운영 변경 전에는 명시적 read-only 트랜잭션으로 카탈로그·권한·비식별 집계만 확인한다.
  GPS 원문, 사용자 식별자·토큰을 조회하거나 검증 목적으로 운영 쓰기·삭제 RPC를 호출하지 않는다.
- RLS와 테이블 GRANT, SECURITY DEFINER와 EXECUTE 권한을 함께 확인한다. 경고가 있다는
  이유만으로 모든 함수·정책을 일괄 폐쇄하지 않는다. 공개 장소 집계·본인 한정 통계와 서버 전용
  관리 동작의 목적을 구분하고 trigger/event_trigger는 일반 RPC와 다르게 취급한다.
- `purge_google_place_hours()`는 만료 캐시 정리이며 앱의 조회 RPC가 아니다. 사전 점검 당시
  anon과 authenticated EXECUTE가 열려 있어 PUBLIC·anon·authenticated 실행을 제거하고
  service_role만 유지하도록 준비했다. 사용자 승인 후 적용했고 스키마 명시·빈 search_path와
  실제 역할별 실행 권한을 재검증했다. 기타 관리 함수는 이 승인 범위에 포함하지 않는다.
- 이 마이그레이션은 권한·함수 정의만 정비한다. 정리 함수를 실행하거나 현재 캐시 행을 삭제하지 않는다.
- 과거 GPS 제거(RIDE-004)와 관리 캐시 정비는 별도 마이그레이션으로 나눈다. 적용 전 예상
  함수 본문 지문·0행 조건이 달라지면 중단하며 짧은 lock/statement 제한과 사후 검증을 둔다.
- 원격 적용·Auth 설정·DB 버전/확장 이동은 별도 승인받는다. 변경 후 실제 RPC 읽기·계정 삭제
  경로·Advisor와 생성 타입을 검증하기 전에는 정비 완료·전체 보안 검증 완료로 표시하지 않는다.

### 제외·후속 검토

RLS 정책 없는 내부 테이블은 직접 API 읽기 차단 의도일 수 있다. 공간 참조 테이블과 PostGIS
public 확장은 SDK/RPC 의존성이 있어 전체 확장 이동으로 급히 해결하지 않는다. 유출 비밀번호
보호는 Auth 플랜·설정·가입 회귀를 확인한 뒤 승인받는다. 함수 본문에 auth.uid가 있다는 것만으로
모든 인자·행 접근이 안전하다고 판단하지 않으며 세부 RLS·Storage·Edge 인증 대조는 계속 남는다.

[공식 함수 권한 안내](https://supabase.com/docs/guides/database/functions),
[공식 제품 보안 목록](https://supabase.com/docs/guides/security/product-security)

### 2026-10-11 승인 후 적용 결과

승인한 GPS 제거·관리 캐시 권한 2건만 적용했다. 적용 이력의 SQL 지문과 저장소 원문이 일치하며
도구가 부여한 실제 버전으로 파일명을 동기화했다. 공개/로그인 역할은 관리 캐시·계정 삭제
선처리를 실행할 수 없고 service_role은 유지한다. 리뷰 16개·즐겨찾기 18개·장소 방문 39개·
영업시간 캐시 771개는 전후 건수와 서버 내 전체 행 체크섬이 같다. 체크섬 원문은 공개하지 않는다.
공개 장소/주변 조회·리뷰 읽기와 익명 개인 기록 차단을 실제 Data API로 확인했다.
전체 RLS/Storage/Edge·계정 삭제 실동작·백업 보존 검증 완료를 의미하지 않는다.


## DBSEC-002 — 길안내 지도 전용 공개 영역·본인 즐겨찾기 읽기 (2026-10-28)

기존 전체 all_places 다운로드를 안내 지도 갱신에 사용하지 않는다. 새
`guide_places_in_viewport`는 승인·미삭제의 기존 공개 기준을 유지하고 PostGIS GiST 영역 필터,
UUID 커서와1~251행 상한을 둔다. bbox는 유효 좌표·양의 넓이·최대2도 범위를 검증한다.
`guide_map_favorites`는 사용자 ID 인자를 받지 않고 auth.uid()의 본인 행만 조회한다.
두 함수는 SECURITY INVOKER·빈 search_path·schema 명시를 적용한다. 즐겨찾기는 PUBLIC/anon
실행을 제거하고 authenticated에만 부여하며 본인 RLS도 그대로 적용한다. 기존 테이블 정책과
기존 RPC의 권한·계약은 바꾸지 않는다. 두 함수 추가이므로 API1과 구버전 호출을 유지한다.

`scripts/test-guide-poi-sql.sh`는 운영 접속 없이 임시 로컬 PostgreSQL/PostGIS와 최소 대응
schema/RLS fixture에서 migration과 실제 역할별 쿼리를 실행한다. 검사 후 서버/자료를 지운다.
원격 Advisor와 전체 migration 재생을 통과했다고 표시하지 않는다. 생성 타입은 새 RPC 반환
계약을 로컬 정의와 동기화한 준비본이며 원격 승인·적용 후 다시 생성/대조한다. DB 배포·푸시는
사용자가 구체적인 변경을 확인하고 승인한 뒤 진행한다.

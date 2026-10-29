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

### 2026-10-28 승인 후 운영 적용·검증

사용자 승인 후 두 읽기 함수만 적용했다. 실제 이력 버전은 `20261028130630`이며 원격
`schema_migrations.statements`의 단일 SQL 원문이 준비 파일과 정확히 일치했다. 도구가 부여한
실제 버전으로 파일명과 검사 스크립트를 맞췄다. 기존 테이블·RLS·다른 함수는 변경하지 않았다.
두 함수 모두 invoker/빈 search_path이며 공개 영역은 anon/authenticated, 즐겨찾기는
authenticated만 실행 가능함을 원격 카탈로그에서 확인했다.

실제 Data API에서 공개 조회200·커서 다음 페이지·빈 영역[]·잘못된 범위400/22023·익명
즐겨찾기401/42501을 확인했다. 별도 READ ONLY 트랜잭션에서 기존 계정2개의 JWT subject를
세션 지역 설정하고 authenticated 역할로 실행한 결과가 각각 본인의 기대 ID 목록과 정확히
일치했다. 개인 ID/장소/토큰은 출력하지 않았고 역할/설정은 rollback했다. 이는 사용자 앱의
JWT HTTP 호출을 대신한 검증이 아니라 운영 DB 역할·RLS 실행 검증이다.

적용 전후 Security Advisor의 새 항목은0개다. 원격 생성 타입의 두 RPC 인자·반환 필드·기본
타입을 대조했다. 생성기가 RETURNS TABLE 필드의 nullable을 추론하지 못하므로 로컬의
명시적 null 반환 타입은 유지했다. 실기기 실제 계정/표시 확인과 장시간 성능 검증은 남는다.

### 2026-10-28 TMAP 공용 캐시·기존 위치 동의 호환 후보(NAV-055)

`20261029001626_add_tmap_guide_pois.sql`은 선택형 TMAP 수신자를 추가하고 capability 없는
구버전에 provider/event를 숨긴다. 기존 consent version·일반 장소 provider 제약은 유지한다.
기존 control의 definer/actor 소유 검사·기록/철회 권한을 유지하고 새 공개 definer를 만들지 않는다.

공용 캐시와 호출 예산은 RLS 활성·anon/authenticated 직접 접근/실행 금지·service_role 전용이다.
두 cache RPC는 invoker/빈 search_path다. 격자 PK 행 잠금+30초 lease/token으로 분산 중복 요청과
지연 writer를 막고 원본23시간·스냅샷 크기/항목 수·KST 하루20,000회 예약 상한을 검사한다.
만료 결과를 반환하지 않으며 조회 때 만료 행을 정리한다. 원 GPS·계정·즐겨찾기는 캐시에 없다.
`scripts/test-tmap-poi-sql.sh`는 임시 PostgreSQL에서 실제 구/신 동의·해제·이력·서비스 역할과
캐시 적중/중복/원본 만료/상한을 검증한다. 운영 Advisor·마이그레이션 적용은 별도 승인 후다.

후속 리뷰에서 만료 셀 정리가 다른 claim의 행 잠금과 budget 잠금을 역순으로 기다리는
데드락을 재현했다. 정리 후보100개를 FOR UPDATE SKIP LOCKED로 확보한 뒤 삭제한다.
`scripts/test-tmap-poi-concurrency.py`는 실제 두 연결의 동일 경합 조건과 신규 SQL assertions를
검사한다. 최대 결과도18×100=1,800개로 맞췄다. 전체 철회 시 TMAP 선택을 제거하고 withdrawn
subject의 구버전 재동의에서 새 제공자를 복원하지 않는 회귀 검사도 통과했다.

### 2026-10-29 인접 TMAP 원본 재사용

아직 미배포인 claim RPC에 선택적 `p_coverage_km default 5`를 추가한다. service_role 전용
invoker/권한은 유지한다. 근처25개 격자·원본 유효기간·정상 결과·구면 거리+요청 반경<=5km를
검사해 예산/lease 예약 전에 반환한다. 원본 격자를 응답에 넣고 요청 격자에 복제하지 않는다.
반경1~5 정수만 허용한다. 기존2인자 호출은 안전하게 동일 원본만 재사용하는5km 기본값이다.
원본/부분 실패/만료·상한·동시 갱신 정책은 유지하고 새로운 공개 조회 권한을 열지 않는다.

인접 선택은 `coverageComplete=true`도 요구한다. source5km 안이어도100개 첫 페이지에서
잘린 결과는 전체 지역의 캐시로 간주하지 않으며 기존 메타데이터 없는 snapshot도 자기 격자
이외에는 사용하지 않는다. 예산/권한/원본 TTL은 바꾸지 않는다.

### 2026-10-29 운영 적용 후 검증

사용자의 새 빌드/TestFlight 요청에 필요한 서버 준비로 TMAP migration·서버 키·Edge v1을
적용했다. 실제 migration version은20261029001626이고 원격/로컬 SQL MD5가 일치함을 확인해
파일명과 로컬 검사 경로를 맞췄다. 실제 새 두 RPC는 invoker, 캐시/예산은 RLS 활성·anon/
authenticated 직접 읽기 및 claim 불가·service_role claim 가능을 운영 카탈로그에서 확인했다.
생성 타입은 새 테이블2개/RPC2개의 공식 결과만 병합해 기존 nullability 보완은 보존했다.

Security Advisor는 기존7그룹을 유지한다. RLS 활성·정책 없음 INFO가 service-only 신규 테이블
2개에 추가됐으며 의도한 deny-all 정책이다. 이 INFO를 없애려고 공개 policy를 추가하지 않는다.
다른 기존 finding은 바뀌지 않았다. 일반 사용자 권한을 넓히거나 기존 동의를 자동 활성화하지 않았다.

전용 임시 비회원 fixture로 실제 HTTP 동의→TMAP 조회200/158장소·partial=false→같은 셀
캐시 적중/원본 만료 동일→전체 철회를 확인했다. 서버 예산은18회로 유지돼 두 번째 조회가
공급자를 재호출하지 않았음을 검증했다. 첫 페이지 잘림 때문에 인접 실조회는 생략했다.
미동의 요청은403으로 차단했고 캐시/공급자 예산을 쓰지 않았다. 임시 subject는 철회 후 그
무작위 해시와 user_id is null 조건으로 한 행만 정리했다. 실제 이용자 동의/계정은 변경하지 않았다.

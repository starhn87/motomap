# DB 공개 권한과 재개 정비

## DBSEC-001 — Advisor 경고는 실제 공개 계약에 대조하고 관리 동작만 최소 권한으로 제한한다

- 날짜: 2026-10-11
- 상태: 읽기 전용 점검·마이그레이션 준비 / 운영 적용 승인 대기
- 관련 기록: RIDE-004, OPS-003, `docs/reports/relaunch-database-security-2026-10-11.md`
- 관련 구현: `supabase/migrations/20261011030532_restrict_maintenance_cache_cleanup.sql`

### 결정

- 운영 변경 전에는 명시적 read-only 트랜잭션으로 카탈로그·권한·비식별 집계만 확인한다.
  GPS 원문, 사용자 식별자·토큰을 조회하거나 검증 목적으로 운영 쓰기·삭제 RPC를 호출하지 않는다.
- RLS와 테이블 GRANT, SECURITY DEFINER와 EXECUTE 권한을 함께 확인한다. 경고가 있다는
  이유만으로 모든 함수·정책을 일괄 폐쇄하지 않는다. 공개 장소 집계·본인 한정 통계와 서버 전용
  관리 동작의 목적을 구분하고 trigger/event_trigger는 일반 RPC와 다르게 취급한다.
- `purge_google_place_hours()`는 만료 캐시 정리이며 앱의 조회 RPC가 아니다. 현재 anon과
  authenticated EXECUTE가 열려 있으므로 PUBLIC·anon·authenticated 실행을 제거하고
  service_role만 유지하도록 준비한다. 스키마를 명시하고 search_path를 비운다.
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

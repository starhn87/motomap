# 운영 관리자 화면

`motomap.kr/admin`은 기존 Cloudflare Worker `motomap-web` 안의 운영 화면이다. 앱 화면이 아니고, 새 호스팅을 만들지 않는다.

## 먼저 확인할 활성 원칙

1. 브라우저에는 공개 껍데기만 둔다. Supabase secret, PostHog personal key, GitHub 읽기 토큰, App Store Connect 개인키는 Worker secret이다.
2. 인가 값은 Auth 사용자 UUID allowlist다. `user_metadata`는 쓰지 않는다. JWT의 `app_metadata`만으로 권한을 확정하지 않는다.
3. allowlist가 비어 있거나 UUID가 아니면 화면 API와 쓰기를 모두 거절하고 외부 조회를 하지 않는다.
4. 지표 정의는 `scripts/posthog-metrics.mjs` 하나다. 도착률은 `reason=arrived` / 실주행 고유 세션이다.
5. 승인·반려는 장소 제보의 기존 상태 전이만 한다. 클릭 전에 제보자 알림이 나간다는 확인이 있어야 한다.
6. 원격 마이그레이션은 PM이 승인하기 전에 적용하지 않는다.

## ADMIN-001 — 관리자 조회와 장소 제보 처리를 Worker에 둔다

- 날짜: 2026-11-07
- 상태: 활성. 원격 마이그레이션·Worker 배포·실연결 검증 전
- 관련: `website/src/admin/`, `website/public/admin.html`, `scripts/posthog-metrics.mjs`, `supabase/migrations/20261108095543_admin_dashboard_state.sql`

### 결정

- 세션 쿠키는 `HttpOnly`, `SameSite=Strict`, `Path=/admin`이다. 쓰기는 `POST`와 같은 출처 `Origin`이 모두 있어야 한다.
- 매 요청마다 Auth `getUser`로 사용자 id를 확인하고 allowlist와 비교한다.
- 주간 컷·QA·PM 추천은 수동 행이다. `source`는 `manual`만 허용하고 갱신 시각을 보여 준다. PM 추천은 `ai_reject_reason`, `ai_recommendation`과 다른 테이블이다.
- 열린 PR과 CI는 GitHub `GET /repos/starhn87/motomap/pulls`와 check-runs만 읽는다.
- TestFlight는 App Store Connect `GET /v1/builds`다. 팀 키 역할은 Developer가 빌드 메타데이터를 보는 최소 역할이다. Developer는 업로드도 할 수 있어 순수 읽기 역할은 아니다. Admin 키는 쓰지 않는다. 호출은 GET만 한다.
- 오류 칸은 PostHog `$exception` 수신 건수다. `$lib`이 `posthog-react-native`이면 JS, `posthog-ios`이면 네이티브로 센다. 그 밖은 분류 불가다. 심볼 해석이 끝났다는 뜻이 아니다. 수집·소스맵·네이티브 빌드는 별도 작업이며 이 화면이 그 브랜치를 수정하지 않는다.
- 키가 없으면 미연결, API가 실패하면 조회 실패, 응답이 빈 목록이거나 0이면 그 값이다. 셋을 같은 상태로 두지 않는다.
- 장소 처리 함수는 `security invoker`이고 execute는 `service_role`만 가진다. 행 잠금 뒤 한 번만 상태를 바꾸고 감사 로그를 같은 트랜잭션에 남긴다. 이미 처리된 행은 다시 쓰지 않는다. `approved`가 null이면 알림 트리거가 울리지 않으므로 바꾸지 않는다.

### 원격에 두기 전에

`20261108095543_admin_dashboard_state.sql`은 저장소에만 있다. 식별자는 운영에 이미 적용된 `20261107142553`보다 뒤다. SQL 본문은 이전 파일 `20261107013809`과 같고, 그 파일은 제거했다. 적용 순서는 마이그레이션, 그 다음 Worker 배포다. 코드가 먼저 배포되면 쓰기는 실패로 남고 장소 행은 바뀌지 않는다. 롤백은 함수 3개와 테이블 3개를 drop 하는 것이다. 이미 승인·반려된 장소는 drop으로 되돌려지지 않는다. 이 함수는 security definer가 아니다. anon·authenticated 권한은 없다.

### 아직 하지 않은 검증

Worker secret과 원격 마이그레이션이 없기 때문에 운영 PostHog·GitHub·App Store Connect·Supabase를 이 화면으로 호출해 확인하지 않았다. 네이티브 크래시가 실제로 도착하는지, 스택이 심볼화되는지는 새 네이티브 빌드 승인 전 입증할 수 없다.

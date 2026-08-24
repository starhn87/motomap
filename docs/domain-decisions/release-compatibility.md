# 릴리스와 버전 호환성

앱 바이너리, OTA, 네이티브 브리지와 백엔드가 서로 다른 시점에 배포되더라도 기존
사용자의 핵심 기능과 데이터를 지키기 위한 결정 기록이다.

관련 구현:

- `config/release-policy.json`, `config/release-notes.json`
- `lib/appVersion.ts`, `lib/appCompatibility.ts`, `lib/updateCheck.ts`
- `modules/kakao-navi/`, `scripts/check-release-compatibility.mjs`
- `public.app_compatibility_policy`

## 현재 계약

- 현재 앱 버전: **1.2.7**
- 공식 지원 직전 버전: **1.2.6**
- 원격 최소 실행 버전: **1.2.4**
- 네이티브 브리지 계약: **1**
- 백엔드 API 계약: **1**

`config/release-policy.json`이 코드가 읽는 기준이고 이 문서는 결정과 운영 절차를
보존한다. 버전·브리지·API 계약을 바꿀 때는 코드, 이 문서, 릴리즈 노트와 App Store
제출 문서를 같은 커밋에서 갱신한다. CI가 현재 값의 동기화를 검사한다.

## 먼저 확인할 활성 원칙

1. `runtimeVersion`은 `appVersion` 정책을 유지한다. 네이티브 코드·플러그인·권한·
   네이티브 의존성이 바뀌면 앱 버전과 런타임을 함께 올린다.
2. 최신 버전 `N`과 직전 버전 `N-1`을 공식 지원한다. `N-1`은 원칙적으로 90일 또는
   최신 버전 보급률 95%까지 유지한다.
3. 강제 업데이트는 보안, 데이터 손상, API 계약 불일치처럼 구버전을 계속 실행하는
   편이 더 위험할 때만 사용한다. 최신 버전이 나왔다는 이유만으로 최소 버전을 올리지
   않는다.
4. OTA는 네이티브 기능을 앱 버전 문자열로 추측하지 않고 실제 브리지의 `features`를
   확인한다. 없는 기능은 숨기거나 기존 동작으로 폴백하며 앱 전체를 종료하지 않는다.
5. 백엔드는 추가형 변경을 먼저 배포하고 구버전과 신버전을 동시에 받는다. 필드 삭제,
   이름 변경, RPC 인자·응답의 비호환 변경은 기존 계약에서 하지 않고 `*_v2`처럼 새
   경계를 만든다.
6. Sentry·PostHog에는 앱 버전, 빌드 번호, 런타임, OTA ID, 네이티브 브리지와 API 계약
   버전을 함께 남긴다. 수정 이슈는 바로 닫지 않고 새 빌드의 `Pending release`로 관리한
   뒤 48~72시간 재발이 없을 때 해결 처리한다.

## REL-001 — 앱 버전을 OTA 호환성 경계로 사용

- 날짜: 2026-08-23
- 상태: 활성
- 관련 구현: `app.config.js`, `eas.json`, `config/release-policy.json`

### 배경

여러 App Store 바이너리가 동시에 사용되는 동안 새 JS가 구 네이티브 메서드를 호출하면
시작 즉시 충돌할 수 있다. 반대로 네이티브 변경이 없는 수정까지 매번 심사 빌드로 보내면
복구 속도가 느려진다.

### 결정

마케팅 버전과 runtime을 같은 값으로 둔다. 같은 바이너리 안의 JS 변경은 해당 runtime
OTA로 배포하고 네이티브 경계가 바뀌면 새 앱 버전을 만든다. 빌드 번호는 EAS remote
source와 `autoIncrement`로 관리한다. `release/<version>` Git 브랜치나 태그를 남겨 지원
중인 이전 runtime에 긴급 수정만 선택적으로 백포트할 수 있게 한다.

### 검토한 대안과 시행착오

runtime을 고정하면 OTA 도달 범위는 넓지만 네이티브 계약이 다른 바이너리를 구분하지
못한다. fingerprint 정책은 정밀하지만 현재 릴리스 운영에는 계약 변화가 불투명해질 수
있어 도입하지 않는다.

### 영향과 재검토 조건

Expo가 fingerprint 정책을 안정화하고 runtime별 백포트·승격 도구가 현재 방식보다 명확한
운영 이점을 제공하면 다시 검토한다.

## REL-002 — 원격 최소·권장 버전은 읽기 전용 정책으로 관리

- 날짜: 2026-08-23
- 상태: 활성
- 관련 구현: `public.app_compatibility_policy`, `lib/appCompatibility.ts`, `lib/updateCheck.ts`

### 배경

App Store 공개 조회는 최신 버전만 알려 주며 Apple CDN 지연이 있다. 최소 지원 버전이나
긴급 차단 여부를 표현할 수 없고, 출시 뒤 구버전 앱에 운영 결정을 전달할 방법도 없었다.

### 결정

플랫폼별 `latest`, `recommended`, `minimum_supported`와 안내 문구·스토어 URL을 Supabase의
공개 읽기 전용 행으로 제공한다. `anon`·`authenticated`는 `SELECT`만 가능하고 변경은
`service_role`만 한다. 원격 조회는 2.5초 안에 끝나지 않거나 값·순서가 잘못되면 무시한다.
그때는 App Store 조회와 로컬 릴리즈 노트가 계속 동작한다.

현재 iOS 원격 정책은 latest/recommended 1.2.6, minimum 1.2.4다. 1.2.7이 TestFlight에만
있는 동안에는 변경하지 않는다. App Store 승인 후 latest/recommended를 1.2.7로 올리고,
minimum은 구버전 위험과 보급률을 확인한 뒤 별도로 결정한다.

### 영향과 재검토 조건

최소 버전 변경은 사용자 진입을 막는 운영 변경이다. 변경 전 해당 버전의 보안·데이터 위험,
App Store 가용성, Sentry·PostHog 보급률을 기록하고 승인받는다.

## REL-003 — 네이티브 브리지는 기능 계약을 직접 노출

- 날짜: 2026-08-23
- 상태: 활성
- 관련 구현: `modules/kakao-navi/ios/KakaoNaviModule.swift`, `modules/kakao-navi/index.ts`

### 배경

기능 도입 버전을 문서와 JS 조건문에 흩어 두면 OTA 백포트나 새 브리지 추가 때 조건이
서로 달라진다. iOS 전용 모듈의 무조건 로드는 미지원 플랫폼의 앱 시작도 막을 수 있다.

### 결정

네이티브 모듈은 `bridgeVersion`과 `features`를 상수로 노출한다. JS는 optional module로
읽고 미지원 환경에서는 구독을 no-op으로, 실제 안내 요청은 명시적 오류로 처리한다.
상수를 도입하기 전 구 브리지는 이미 검증된 기능 집합만 명시적으로 폴백하고, 새 네이티브
방어 기능은 지원한다고 추측하지 않는다.
기능 추가·삭제 또는 wire 타입 변경 시 `nativeBridgeVersion`을 올리고 CI 검사와 이 문서를
함께 갱신한다.

### 영향과 재검토 조건

단순 네이티브 내부 버그 수정처럼 JS 계약이 동일해도 새 바이너리는 필요하지만 브리지
계약은 올리지 않을 수 있다. JS가 새 메서드·이벤트·상수를 사용하면 반드시 올린다.

## REL-004 — TestFlight 전용 API는 공개 제출 전에 철회할 수 있다

- 날짜: 2026-08-24
- 상태: 활성
- 관련 구현: `supabase/migrations/20260824111321_drop_registered_place_reactions.sql`,
  `config/release-policy.json`

### 배경

1.2.7 TestFlight에서 시험한 등록 장소 좋아요와 인기 순위를 제출 전에 철회했다. App Store 운영
버전 1.2.6은 해당 테이블·RPC를 호출하지 않는데도 일반 공개 구버전 호환을 가정하면 사용하지 않는
API와 데이터를 장기간 유지하게 된다.

### 결정

App Store에 공개된 버전과 지원 대상 OTA가 한 번도 사용하지 않은 TestFlight 전용 API는 같은
후보 버전을 제출하기 전에 클라이언트 호출과 DB 계약을 함께 제거할 수 있다. 이 경우 공개된 API
계약의 호환성을 깨지 않으므로 `apiContractVersion`은 올리지 않는다. TestFlight 설치본에서는 새
OTA가 먼저 적용되도록 한 뒤 제거 마이그레이션을 적용한다.

### 영향과 재검토 조건

공개 버전, 심사 제출본 또는 운영 OTA가 한 번이라도 호출한 API에는 이 예외를 적용하지 않는다.
그때는 추가형 변경과 버전 경계, 구계약 유지 기간을 기존 원칙대로 설계한다.

## 릴리스 체크리스트

1. `config/release-policy.json`의 앱·지원·계약 버전을 결정한다.
2. `config/release-notes.json`, App Store 문서, 이 문서의 현재 계약을 함께 갱신한다.
3. 백엔드 변경은 구버전 요청을 먼저 수용하고 직전 버전 최신 OTA와 새 TestFlight 양쪽에서
   인증·검색·즐겨찾기·리뷰·딥링크·푸시를 확인한다.
4. `npm run check:release`, `npm run typecheck`, Edge Function 타입체크를 통과시킨다.
5. TestFlight에서 새 설치와 직전 버전 업데이트, 길안내 시작·백그라운드·복귀·종료를
   확인한다.
6. 위험도가 높은 지도·인증·길안내 OTA는 단계 배포하고 Sentry·PostHog의 버전 태그로
   이상을 확인한다. 문제면 신규 배포를 중단하거나 embedded update로 롤백한다.
7. App Store 승인 후 원격 latest/recommended와 사용자용 공지를 갱신한다. minimum은
   별도 근거와 승인 없이 올리지 않는다.

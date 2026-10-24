## 2026-10-24 1.2.10 / native 10 실기기 피드백 후보

경로 보기 CTA만 로딩을 표시하고 경로 대안은 가로 한 줄로 스와이프한다.
길안내 하단을 홈 인디케이터 위로 띄우고 도착시각·거리 위에 현재 도로명/목적지를 5초마다 교대한다.
소요시간 설명·메뉴 X를 제거하고 최소 음량 아이콘으로 즉시 음소거한다.
GPS가 없어도 다른 경로/목적지/경유지 편집은 열며, 실제 안내 변경 때 최신 위치를 요구한다.
위치 확인 실패 시 편집을 보존하고 재시도를 제공하며 진입 오류는 native 안내 위에 알린다.
SDK의 GPS 경고 문구·위치 공개 API는 없어 원문을 보존한다. 코스 샘플 경유 고정 정책은 유지한다.
앱/runtime 1.2.10, API 1, candidate 유지. 로컬 실기기 테스트 범위이며 원격 배포·Apple 제출은 하지 않는다.

## 2026-10-24 1.2.10 / native 9 로컬 레이아웃 후보

접힌 길안내 하단은 도착시각·거리 중심의 68pt 바로 줄이고, 오른쪽 메뉴를 펼치면
상단 음량 range, 한 줄 아이콘 기능, 하단 안내 종료 버튼을 표시한다. 펼친 시트 뒤 지도는
어둡게 처리하고 바깥 탭으로 닫는다. 새로고침은 접힌 바의 왼쪽을 유지한다.
색상은 앱의 모노크롬 브랜드 팔레트를 쓰고 음량 slider 채움만 기존 파랑을 유지한다.
SDK 회전 안내 데이터/레이아웃은 보존한다.
기존 미출시 native 8 후속이며 로컬 실기기 테스트만 승인됐다. 원격 배포·새 TestFlight·심사는 미실행이다.

## 2026-10-24 1.2.10 / native 8 로컬 후보

길안내 하단을 앱 내 번들 웹 UI로 구성한다. 메뉴를 펼치면 상단 안내 음량 슬라이더,
위험 제보·경로 다시 찾기·목적지 변경·경유지 편집·길안내 종료가 나온다.
왼쪽 새로고침은 즉시 재탐색, 경로 다시 찾기는 현재 위치→목적지 경로 비교 미리보기다.
코스 샘플 경유지는 3개 초과 시 편집을 잠그고, 목적지/경유 경로 변경 시 원코스 완주로 세지 않는다.
외부 웹 콘텐츠는 로드하지 않으며 SDK 엔진·음성은 미리보기 중 유지한다.
1.2.9 공개 바이너리는 변경하지 않는다. 이 변경의 새 빌드·업로드·심사 제출은 아직 하지 않았다.
실제 주행·백그라운드 복귀·음량·도착 및 뒤로 복원은 새 바이너리 실기기 검증이 필요하다.

## 2026-10-21 native 7 안전운행 화면 차단 후보

**1.2.9 / native 7 / API 1** 로컬 후보다. SDK 안전운행 모드의 렌더 입구를 차단하고,
사후 안전운행 상태가 오면 SDK 뷰를 숨긴다(NAV-015). 목적지 유지·복귀 요청·수동 종료와
시작 음성은 유지한다. 43번에는 이 차단 경계가 없으므로 새 빌드가 필요하며 현재 푸시·
빌드·업로드·심사 재제출은 미실행이다. 새 바이너리에서 시작/도착/오류/이탈/재안내/
지도 이동/메뉴/앱 복귀와 종료·위치 철회를 실기기로 검증한다.

## 2026-10-21 native 6 로컬 후보

사용자가 1.2.9(42) 심사를 취소했다고 알렸다. 다음 후보는 **1.2.9 / native 6 / API 1**이다.
커스텀 시작 음성 “길안내를 시작합니다. 안전한 라이딩 되세요!”와 목적지 주변 안내 유지·
통과 후 원 목적지 복귀 요청(NAV-013/014)을 추가한다. 42번 산출물과 기존 심사 노트에
소급 반영됐다는 의미가 아니다. 새 빌드·업로드·심사 재제출은 아직 하지 않았다.
실제 도착/통과·GPS/오프라인·목적지 변경/종료 경합과 새 음성 청취는 새 바이너리에서 확인한다.

## 2026-10-20 1.2.9 새 제출본

- [x] 사용자 새 빌드·릴리스 노트·심사 제출 승인
- [x] 최신 앱/서버 타입 검사, 전체 285개 테스트, Edge Function lint·타입 검사, 릴리스 정책 검사
- [x] 네이버 교차 감지 코드 리뷰 (앱 네이티브 변경 없음)
- [x] 새 production 1.2.9 (42), EAS a701ba8c-43d8-4661-91e5-5bbf3926c01d·소스·버전·runtime·채널·실제 산출물 확인
- [x] Apple 직접 업로드·처리 완료 후 1.2.9에 실제 42번 연결·저장
- [x] KO 릴리스 노트·심사 메모 저장 후 재조회, 기존 심사 접근 설정 확인
- [x] 2026-10-21 00:17 KST 수동 출시 유지·심사 제출 완료, 심사 대기 중 확인

41번 이후 새 실제 기기 동작을 전부 검증했다는 의미는 아니다. 기존 미검증 실기기 항목은 아래 이력을 유지한다.


- [x] 2026-10-17 native 5 production 1.2.9 (41) 빌드·산출물 버전/runtime/채널·오디오 클래스/selector 검사
- [x] 사용자 승인 후 41번 Apple TestFlight 업로드 성공 (submission 597f22ed-ccf5-4871-abd4-9085d25a2547; Apple 처리 중)

- [ ] NAV-011 native 5 새 바이너리에서 음악/영상/Bluetooth와 음성 감쇠·복원, 연속/취소/전화 검증 (40번 미포함)

- [x] 2026-10-17 native 4 production 1.2.9 (40) 빌드·산출물 버전/runtime/채널·신규 selector 검사
- [x] 사용자 승인 후 40번의 Apple TestFlight 업로드 성공 (submission 31bcbf63-c3fb-490f-8c28-56723a527822; Apple 처리 중)

<!-- 2026-10-17 후속 후보: native 4. 기존 39번은 회귀 확인용이며 제출 확정본이 아니다. -->
- [ ] native 4 새 바이너리에서 실제 탭·팬·복귀·안전운행·종료/제보 검증
- [ ] 장소 서버 마이그레이션 선행 후 warm-cache 폐업·이전·외부 재등장 회귀 검증

# App Store 제출 체크리스트

순서대로 따라하면 됨. 각 항목 옆에 참조 문서/명령어 표기.

## 1.2.9 길안내 UI 후보 (2026-10-16)

- [x] 승인 후 새 1.2.9 (39) / native 3 production iOS 빌드·산출물 버전/runtime/채널 검사 (NAV-010)
- [ ] 새 바이너리 실기기 설치 (OTA 단독 반영 불가)
- [ ] 실주행 화면 지도 이동·전체 경로·구간 정보에서 종료·위험 제보 버튼이 함께 숨겨지는지 확인
- [ ] 일반 안내·도착 후 안전운행 복귀 시 두 버튼 복원, 종료·위험 제보 동작 확인
- [ ] 시뮬레이션 SDK 종료 버튼과 기존 자차 마커·안내 문구 회귀 확인
- [ ] 새 바이너리 검증 후 메타데이터 확정 및 제출·공개 배포 승인 확인

아래 1.2.8 기록과 검증은 이전 출시 이력이며 새 후보의 검증 결과로 사용하지 않는다.

## 1.2.8 재개 후보의 우선 게이트 (2026-10-10)

- [ ] Expo 57 / RN 0.86.3 / 최소 iOS 16.4의 네이티브 빌드·실기기 회귀 검증
- [ ] Xcode 27 / iOS 27 SDK의 scene 실행, 카카오 로그인·콜드/웜 링크 및 길안내 background/foreground 검증
- 성능 최적화·전체 반복 측정은 **출시 후로 보류**한다(2026-10-11 사용자 요청, PERF-006).
  예비 기록·검색 전후 비교·사진 smoke는 보존한다. 크래시·hang·핵심 기능 실패 점검은 유지한다.
- [ ] `docs/relaunch-readiness.md` 및 OPS-003의 운영·내부 테스트·심사 접근 조건 확인
- [ ] 푸시·운영 복구·빌드·제출·배포 승인 확인. 아래 과거 제출 순서를 바로 실행하지 않음
- [ ] 최종 릴리스 노트·메타데이터·실제 데이터 흐름 재확인

2026-10-11 OPS-007: 별도 심사 접근 코드는 제외한다. 이미 완료한 실기기 기능 검증과
사용자 정상 확인을 반복 요구하지 않는다. 남은 것은 고지 동기화·승인된 정상 서비스 진입과
최신 production 산출물의 서명·채널·버전·설치·실행 확인이다. 새 빌드나 환경 차이에서 문제가
발견된 경로만 추가 검증한다. 시행일은 2026-10-11로 확정했다(OPS-009).
고지·동의 적용·active 전환·production 빌드·검증·심사 제출은 승인됐다.
Git 푸시·판매 재개·전체 알림·웹 소개/공유 복구는 이번 승인 범위에서 제외한다.

2026-10-11 초기 소스 보완·자동 검사 결과는
[회귀 검증 보고서](reports/release-regression-2026-10-11.md)에 기록했다.
74개 자동 테스트 통과는 위 네이티브·실기기·TestFlight 체크를 대신하지 않는다.

2026-10-11 초기 후속 기록: 로컬 내부 Release 기본 길안내·사진·날씨·설정·콜드/웜 장소 링크
smoke와 스플래시 전환은 확인했다. 당시 최신 길안내·날씨/유가 실패 처리 소스는 미설치였다.

2026-10-11 최종 후속: 최신 소스의 로컬 내부 Release 재설치·기능 smoke 5개와 경로 미리보기
1개, 자동 테스트 114개가 통과했다. 내부 TestFlight 1.2.8 (36)의 Apple 처리·기존 internal
그룹(본인 1명) 연결과 테스트 안내 저장도 확인했다. TestFlight 배포 서명 앱의 실제 설치·전체
회귀와 App Store 심사 접근은 아직 별도이며 위 우선 게이트를 전체 완료로 체크하지 않는다.
과거 가입·새 앱 등록 단계는 첫 출시 참고이며 기존 앱을 다시 등록하지 않는다.

---

## Phase A: 사전 준비

### A-1. Apple Developer Program 가입 승인
- [ ] https://developer.apple.com/account 접속하여 **Team ID** 표시되는지 확인
- [ ] "Welcome to the Apple Developer Program" 이메일 수신 확인
- [ ] 개인 등록은 24~48시간 소요. 추가 서류 요청 메일 체크
> 현재 단계 (대기 중)

### A-2. App Store Connect 앱 등록
- [ ] https://appstoreconnect.apple.com 접속
- [ ] **My Apps → +** 클릭
- [ ] 정보 입력:
  - Platform: iOS
  - Name: **모토맵**
  - Primary Language: Korean
  - Bundle ID: **com.ridemap.app** (드롭다운에서 선택)
  - SKU: **ridemap-ios-001**
  - User Access: Full Access

### A-3. Sentry 세팅 (선택 — 런칭 후 적용 가능)
- [ ] https://sentry.io 가입 + 새 프로젝트(React Native, name: ridemap) 생성
- [ ] DSN 받아서 `.env`에 추가:
  ```
  EXPO_PUBLIC_SENTRY_DSN=https://...@oXXX.ingest.sentry.io/XXX
  SENTRY_ORG=your-org-slug
  SENTRY_PROJECT=ridemap
  ```
- [ ] Auth Token 발급 → EAS Secret 등록:
  ```bash
  eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value sntrys_...
  ```

### A-4. 리뷰어용 테스트 계정 생성
- [ ] 앱에서 이메일/비밀번호로 가입:
  - Email: `apple-review@ridemap.app` (또는 본인이 사용 가능한 이메일)
  - Password: 영문/숫자/특수문자 8자 이상
- [ ] 로그인 정상 동작 확인
- [ ] 닉네임, 프로필 사진 등 설정

### A-5. 개인정보 처리방침 확인
- [ ] `https://motomap.kr/privacy` 접속 가능 확인 (로그인 없이 열림)
- [ ] 수집 항목과 앱 실제 동작 일치 확인 (`docs/app-store-submission.md` 섹션 3 비교)
- [ ] `npm run check:legal -- --ready`: 재개 시행일·실제 고지일·동의 버전 동기화 확인
  현재 active·시행일/고지일/동의 버전은 2026-10-11이다. 정식 `/privacy` 고지의 실제 배포를
  확인한다. 기존 동의 기록은 보존하고 새 수락은 별도 이력으로 받는다.

### A-6. 최소 시드 데이터 확인
- [ ] 앱 첫 실행 시 빈 화면 아닌지 확인
  - 지도: 마커 표시됨
  - 코스: 카드 1개 이상
- [ ] 없으면 `scripts/seed-bike-cafes.mjs` 실행

---

## Phase B: 빌드 & TestFlight

### B-1. EAS 빌드 (production)

```bash
cd /Users/iseung-u/Projects/motomap
set -a && source .env && set +a
eas build --platform ios --profile production
```

Distribution Certificate, Provisioning Profile, Push Key와 ASC API Key는 EAS에 등록되어 있다. 새 capability를 추가했다면 EAS가 갱신한 프로비저닝 프로파일을 사용하는지 빌드 로그에서 확인한다.

빌드 시간: **15~30분** (Expo 클라우드)

### B-2. TestFlight 자동 업로드

빌드 완료 후:
```bash
eas submit --platform ios --id <PRODUCTION_BUILD_ID> --profile production
```

자동으로 ASC에 업로드됨. 5~10분 후 ASC > TestFlight 탭에서 빌드 확인 가능.

`<PRODUCTION_BUILD_ID>`는 승인된 production 빌드의 실제 ID로 바꾼다. 제출 전 버전·runtime·
빌드 profile과 채널을 확인하고 `--latest`는 쓰지 않는다. 가장 최근 빌드가 내부 채널일 수
있으며 내부 검증 바이너리를 공개 제출본으로 오선택하면 안 된다.

### B-3. TestFlight 내부 테스트
- [ ] ASC > TestFlight > 빌드 선택 → **Provide Export Compliance Information**
- [ ] "No, my app does not use encryption" 선택
- [ ] TestFlight 앱(iPhone)에서 직접 설치 후 동작 확인
  - 지도 로딩
  - 검색
  - 장소 상세
  - 코스 목록
  - Apple·카카오·네이버·Google 신규 가입, 취소, 로그아웃 후 재로그인
  - 기존 이메일 계정에 각 소셜 로그인 연결 후 사용자 ID·기존 데이터 유지
  - 소셜 신규 가입 중 온보딩 취소 후 미완료 계정 정리
  - 앱 재실행 후 보안 저장소 세션 유지
  - 리뷰 작성
  - 내 바이크·라이딩 기록과 이미지 공유 카드
  - 장소·코스 `https://motomap.kr/...` 유니버설 링크
  - 햅틱 켜기·끄기
  - 경로 미리보기와 실제 이륜차 길안내

---

## Phase C: 스크린샷

### C-1. 시뮬레이터 캡처 (Maestro 자동화)

설치 안 됐으면:
```bash
brew tap mobile-dev-inc/tap && brew install maestro
```

시뮬레이터에서 6.9" 디바이스 실행 후 앱 설치 → 자동 캡처:
```bash
# 시뮬레이터 부팅
xcrun simctl boot "iPhone 16 Pro Max"
open -a Simulator

# 상태바 9:41 고정
xcrun simctl status_bar booted override \
  --time "9:41" \
  --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3

# 앱 빌드 + 설치 (로컬)
npx expo run:ios --device "iPhone 16 Pro Max"

# 스크린샷 자동 캡처
maestro test .maestro/main.yaml --debug-output ./screenshots
```

상세는 `.maestro/README.md` 참조.

### C-2. 수동 보완

자동 캡처로 안 되는 화면이나 데이터 부족한 화면은 시뮬레이터에서 수동 캡처:
- 단축키: **Cmd + S** (바탕화면 저장)
- 또는: `xcrun simctl io booted screenshot ~/Desktop/manual_XX.png`

### C-3. 체크
- [ ] 최소 3장 (권장 6~8장)
- [ ] 해상도 1320×2868 (6.9") 확인
- [ ] 본인 정보 가리기 (이메일/닉네임 노출 무방)
- [ ] 알림/모달 떠있는 상태 X
- [ ] Lorem ipsum 같은 더미 텍스트 X

---

## Phase D: ASC 메타데이터 입력

`docs/app-store-submission.md` 의 각 섹션을 참조하여 ASC에 복붙.

### D-1. App Information
- [ ] Subtitle: `바이커 장소, 코스, 이륜차 길안내`
- [ ] Privacy Policy URL: `https://motomap.kr/privacy`
- [ ] Category: Navigation / Travel
- [ ] Content Rights: Yes, necessary rights secured

### D-2. Pricing and Availability
- [ ] Free
- [ ] Korea, Republic of 만 선택

### D-3. App Privacy
ASC > App Privacy > **Get Started**
- [ ] Contact Info > Email Address
- [ ] User Content > Photos, Other User Content
- [ ] Identifiers > User ID
- [ ] Location > Precise Location
- [ ] Search History
- [ ] Usage Data > Product Interaction
- [ ] Diagnostics > Crash Data, Performance Data
- [ ] Tracking: **No**

각 항목별 설정 (모두 동일):
- Linked to user: **Yes**
- Used for tracking: **No**
- Purposes: **App Functionality** (Diagnostics는 + Analytics)

### D-4. Version Information (1.2.8)
- [ ] `config/release-notes.json`의 1.2.8 공지를 최종 회귀·승인 결과에 맞춰 확정
- [ ] **Promotional Text** (170자)
- [ ] **Description** (4000자)
- [ ] **Keywords** (100자)
- [ ] Support URL: GitHub Issues
- [ ] Marketing URL: `https://motomap.kr`
- [ ] Copyright: `© 2026 모토맵`
- [ ] **What's New**: `docs/app-store-submission.md` / `docs/app-store-listing.md`의 1.2.8 초안 최종 확정
- [ ] **Screenshots**: 6.9" Display에 드래그앤드롭

### D-5. App Review Information
- [ ] Sign-In Required: **Yes**
- [ ] Username: `apple-review@ridemap.app`
- [ ] Password: (Phase A-4에서 만든 비밀번호)
- [ ] Contact: 이름/전화/이메일
- [ ] preparing에서 production 앱으로 실제 진입 가능한 심사 경로 검증 (계정만으로는 해결되지 않음)
- [ ] Notes: `docs/app-store-submission.md`의 과거 1.2.7 노트를 그대로 복사하지 않고 1.2.8 KO+EN 노트 확정

### D-6. Age Rating
- [ ] **Edit** 클릭 → 설문 답변
- [ ] User-Generated Content: **Yes** (Infrequent/Mild)
- [ ] 나머지: 모두 None
- [ ] 결과: 4+

### D-7. Export Compliance
- [ ] Build > Export Compliance Information
- [ ] "Does your app use encryption?": **No**

---

## Phase E: 제출

### E-1. Submit for Review
- [ ] 모든 섹션 입력 완료 확인 (왼쪽 사이드바 체크마크)
- [ ] 우측 상단 **Add for Review** 클릭
- [ ] **Submit for Review** 클릭

### E-2. 심사 대기
- 평균 **24~48시간** (최대 7일)
- ASC > App Store > **Waiting for Review** → **In Review** → **Pending Developer Release** (또는 자동 출시)
- 이메일로 진행 알림 옴

### E-3. 승인 후
- [ ] **Release this version**: 수동 출시 or 자동 출시 선택
- [ ] 출시되면 **Ready for Sale** 상태 → App Store 검색 가능
- [ ] 첫 출시는 인덱싱에 몇 시간 걸림

---

## 자주 묻는 리젝 사유 & 대응

| 리젝 사유 | 대응 |
|----------|------|
| **2.1 App Completeness** — 빈 화면, 더미 데이터 | Phase A-6 시드 데이터 확인 |
| **5.1.1 Privacy** — Privacy Policy 누락/불일치 | Notion URL 공개 확인, 수집 항목 일치 |
| **2.3 Accurate Metadata** — 설명과 실제 기능 불일치 | Description 다시 검수 |
| **2.5 Software Requirements** — 위치 권한 사유 불명 | Info.plist 한국어 메시지 확인 |
| **1.2 User Generated Content** — 모더레이션 부재 | Notes 노트에 신고/차단/검토 흐름 명시 |
| **4.0 Design** — 디자인 결함 | 다크모드 대비, 상태바 안전영역 확인 |
| **2.1 Demo Account** — 테스트 계정 미작동 | A-4 계정으로 직접 로그인 테스트 |

---

## 리젝 시 대응 흐름

1. ASC > Resolution Center에서 리젝 사유 확인
2. 코드 수정 또는 메타데이터 수정
3. 코드 변경이면: 새 빌드 업로드 → 새 버전 제출
4. 메타데이터만이면: ASC에서 수정 → Submit 재시도
5. 사유 불분명하면 Resolution Center에서 **Reply**로 질문

---

## 출시 후 모니터링

- [ ] Sentry에서 크래시 발생률 모니터링
- [ ] ASC > Analytics에서 다운로드 수치 확인
- [ ] App Store 리뷰/별점 응답 (24시간 내 권장)
- [ ] 사용자 피드백 수집 → Phase 2 백로그 (`memory/project_phase2_backlog.md`) 참조

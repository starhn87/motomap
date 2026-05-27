# App Store 제출 체크리스트

순서대로 따라하면 됨. 각 항목 옆에 참조 문서/명령어 표기.

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
  - Name: **RideMap**
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
- [ ] Notion 공개 URL 접속 가능 확인 (로그인 없이 열림)
- [ ] 수집 항목과 앱 실제 동작 일치 확인 (`docs/app-store-submission.md` 섹션 3 비교)

### A-6. 최소 시드 데이터 확인
- [ ] 앱 첫 실행 시 빈 화면 아닌지 확인
  - 지도: 마커 표시됨
  - 코스: 카드 1개 이상
- [ ] 없으면 `scripts/seed-bike-cafes.mjs` 실행

---

## Phase B: 빌드 & TestFlight

### B-1. EAS 빌드 (production)

**별도 터미널(macOS Terminal.app)**에서 실행 — Claude Code의 `!` 래퍼는 비대화형이라 Apple 2FA 입력 못 함:

```bash
cd /Users/iseung-u/Projects/ridemap
set -a && source .env && set +a
npx eas build --platform ios --profile production
```

진행되는 프롬프트:
- [ ] Apple ID 입력
- [ ] 비밀번호 입력
- [ ] 2FA 코드 입력 (다른 Apple 기기에 알림 옴)
- [ ] Distribution Certificate 생성: **Y**
- [ ] Provisioning Profile 생성: **Y**
- [ ] Push Key 생성: **Y** (푸시 알림은 나중에 쓸 거면)

빌드 시간: **15~30분** (Expo 클라우드)

### B-2. TestFlight 자동 업로드

빌드 완료 후:
```bash
npx eas submit --platform ios --latest
```

자동으로 ASC에 업로드됨. 5~10분 후 ASC > TestFlight 탭에서 빌드 확인 가능.

### B-3. TestFlight 내부 테스트
- [ ] ASC > TestFlight > 빌드 선택 → **Provide Export Compliance Information**
- [ ] "No, my app does not use encryption" 선택
- [ ] TestFlight 앱(iPhone)에서 직접 설치 후 동작 확인
  - 지도 로딩
  - 검색
  - 장소 상세
  - 코스 목록
  - 로그인/회원가입
  - 리뷰 작성
  - 네비게이션 외부 앱 연동 (카카오맵/T맵)

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
- [ ] Subtitle: `바이커 전용 지도 · 코스 · 리뷰`
- [ ] Privacy Policy URL: (Notion 공개 URL)
- [ ] Category: Navigation / Travel
- [ ] Content Rights: No third-party content

### D-2. Pricing and Availability
- [ ] Free
- [ ] Korea, Republic of 만 선택

### D-3. App Privacy
ASC > App Privacy > **Get Started**
- [ ] Contact Info > Email Address
- [ ] User Content > Photos, Other User Content
- [ ] Identifiers > User ID
- [ ] Location > Precise Location
- [ ] Diagnostics > Crash Data, Performance Data
- [ ] Tracking: **No**

각 항목별 설정 (모두 동일):
- Linked to user: **Yes**
- Used for tracking: **No**
- Purposes: **App Functionality** (Diagnostics는 + Analytics)

### D-4. Version Information (1.0.0)
- [ ] **Promotional Text** (170자)
- [ ] **Description** (4000자)
- [ ] **Keywords** (100자)
- [ ] Support URL: GitHub Issues
- [ ] Marketing URL: (비워둠)
- [ ] Copyright: `© 2026 RideMap`
- [ ] **What's New**: 출시 안내
- [ ] **Screenshots**: 6.9" Display에 드래그앤드롭

### D-5. App Review Information
- [ ] Sign-In Required: **Yes**
- [ ] Username: `apple-review@ridemap.app`
- [ ] Password: (Phase A-4에서 만든 비밀번호)
- [ ] Contact: 이름/전화/이메일
- [ ] Notes: `docs/app-store-submission.md` 섹션 5의 KO+EN 노트 전체 복붙

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

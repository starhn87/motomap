# App Store 제출 체크리스트

순서대로 따라하면 됨. 각 항목 옆에 참조 문서/명령어 표기.

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
발견된 경로만 추가 검증한다. 시행일은 실제 재개일로 정하며 날짜는 아직 미정이다.
Git 푸시·active 전환·배포·빌드·심사 제출 전 승인은 계속 필요하다.

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
  현재 `draft`는 준비 상태다. `/privacy/upcoming` 등 개정안을 정식 Privacy Policy URL로
  등록하거나 옛 동의 버전으로 새 본문을 시행하지 않는다. 기존 동의 기록은 보존한다.

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

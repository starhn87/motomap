# App Store Connect 제출용 메타데이터

1.2.8 제출 후보를 준비한다. 아래 1.2.7 메타데이터는 과거 기록이며 그대로 제출하지 않는다.
Expo 57 / 최소 iOS 16.4 조합의 네이티브·실기기 검증과 운영·심사 접근 승인 후
ASC > My Apps > 모토맵 > 1.2.8에 실제 기능·개인정보·리뷰 접근 정보에 맞춘 값을 입력한다.
사용자 승인 후 내부 TestFlight 1.2.8 (36)의 Apple 업로드를 완료했다.
App Store 심사 제출·판매 재개·공개 운영 재개는 미실행이다.
Xcode 27 / iOS 27 SDK 조합의 로컬 내부 Release 설치·기본 길안내/복귀/종료와 콜드/웜
장소 링크 smoke는 통과했다. 로그인 정상 동작은 운영자가 확인했다. 최신 길안내·날씨/유가
실패 대응 소스의 로컬 내부 Release 설치 후 기본 smoke 5개·경로 미리보기 1개도 통과했다.
제공자별 로그인·TestFlight 배포 서명 설치·전체 장애 주입 회귀는 남아 있다.
[실제 검증 범위](reports/release-regression-2026-10-11.md)를 따른다.

## 1.2.8 새로운 기능 초안

아래 문구는 최종 내부/TestFlight 회귀 후 확정할 후보이며 ASC에 입력하지 않았다.
CPU·메모리 개선율, 프리 웜업·라이딩 경로 Visualizer의 구현 완료를 주장하지 않는다.

```text
- 앱 실행 기반과 주요 라이브러리를 업데이트했어요.
- iOS 27 앱 실행 호환성을 보완하고 지도 위치 추적의 종료 처리를 개선했어요.
- 로그인 세션 복구와 장소 검색·공유 링크의 오류 대응을 다듬었어요.
- 길안내 초기화·경로 조회 실패 시 안내를 보완했어요.
- 날씨·유가 조회가 실패하면 상태를 확인하고 다시 시도할 수 있어요.
- 기존 바이크 시작 화면을 유지하고 지도 전환을 다듬었어요.
```

### 1.2.8 심사 접근 확정 전에는 제출하지 않는다

`preparing`에서 production 앱은 로그인 이전에 차단된다. 아래 과거 리뷰어 계정·노트만으로
진입할 수 있다고 안내하지 않는다. 실제 서비스와 같은 기능에 접근하는 승인된 심사 경로를
먼저 구현·검증하고 KO/EN 노트를 확정한다. `internal-testflight` 바이너리를 App Store에
그대로 제출하지 않으며 검증된 소스의 별도 production 빌드 ID를 명시해 제출한다.
[재개 게이트](relaunch-readiness.md)의 운영·심사·공개 승인 경계는 유지한다.

아래 메타데이터·리뷰어 노트는 **과거 1.2.7 참고 기록**이다. 설명·개인정보·계정·연령 설문은
1.2.8의 실제 동작과 현재 ASC 설정에 대조하기 전 그대로 복사하지 않는다.

---

## 1. App Information

### App Name
```
모토맵
```
> 30자 제한. 한국 App Store는 영문/한글 혼용 가능. 검색 노출 최적화를 위해 부제는 따로.

### Subtitle
```
바이커 장소, 코스, 이륜차 길안내
```
> 30자 제한. 핵심 가치 + 검색 키워드.

### Primary Category
```
Navigation
```

### Secondary Category
```
Travel
```
> Lifestyle도 후보지만 Travel이 라이딩/투어 카테고리에 더 적합.

### Bundle ID
```
com.ridemap.app
```

### SKU (Stock Keeping Unit)
```
ridemap-ios-001
```
> 내부 관리용. 임의 문자열.

### Content Rights
- [x] Yes, and I have the necessary rights to use third-party content
> 네이버 지도·카카오 일반 장소·네이버 API HUB 지역 검색·공공 날씨/유가 정보와 이용자 제보·리뷰를 표시한다. 각 제공 API 약관과 앱 내 신고·차단·운영 검토 절차에 따라 사용한다.
> 네이버 지역 검색은 서버 키·Edge v1 배포와 로컬 내부 실기기 검색 검증을 완료했다. 집/회사 확인창도 내부 실기기에서 확인했지만 TestFlight (36)에는 두 후속이 없다. 실제 제출 시 최신 production 빌드·심사 접근·공개 법률 고지 반영을 다시 확인한다.

---

## 2. Pricing and Availability

- **Price**: Free (0원)
- **Availability**: 대한민국 (Korea, Republic of) 만 선택
> 다국가 출시는 나중 단계. 한국 우선.

---

## 3. App Privacy

> ASC > App Privacy 섹션. 각 데이터 항목별로 답변.

### Data Linked to User (사용자 식별 가능 데이터)

#### Contact Info
- **Email Address**
  - 수집 목적: App Functionality (계정 생성/로그인)
  - 트래킹 사용: No

#### User Content
- **Photos**
  - 수집 목적: App Functionality (리뷰 사진 첨부)
  - 트래킹 사용: No
- **Other User Content** (리뷰 텍스트, 닉네임, 제보 정보)
  - 수집 목적: App Functionality
  - 트래킹 사용: No

#### Identifiers
- **User ID** (Supabase user UUID)
  - 수집 목적: App Functionality
  - 트래킹 사용: No

#### Location
- **Precise Location**
  - 수집 목적: App Functionality, Product Personalization (현재 위치 표시, 주변 장소 검색, 도착·방문 기록)
  - 트래킹 사용: No
> 연속 이동 경로는 저장하지 않지만 로그인 사용자의 도착지·경유지와 시각은 라이딩 기록을 위해 계정에 연결해 저장한다.

#### Search History
- **Search History** (앱 내 장소·코스 검색어)
  - 수집 목적: Analytics, App Functionality (검색 품질·미등록 장소 개선)
  - 트래킹 사용: No

#### Usage Data
- **Product Interaction** (화면 조회, 기능 사용 이벤트, 세션 리플레이)
  - 수집 목적: Analytics, App Functionality
  - 트래킹 사용: No

#### Diagnostics
- **Crash Data**
  - 수집 목적: App Functionality, Analytics (Sentry로 크래시 추적)
  - 트래킹 사용: No
- **Performance Data**
  - 수집 목적: App Functionality, Analytics
  - 트래킹 사용: No

### Data NOT Collected
- Health & Fitness
- Financial Info
- Sensitive Info
- Browsing History
- Contacts
- Purchases
- Audio Data
- Gameplay Content

### Tracking
- **Does this app track users?**: **No**
> PostHog(제품 분석·마스킹된 세션 리플레이)와 Sentry(오류·성능 진단)를 사용하지만 광고 목적의 제3자 데이터 결합이나 데이터 브로커 제공은 하지 않는다.

---

## 4. Version Information (1.2.7)

### Promotional Text (170자 제한)
```
라이더 장소와 코스를 찾고 이륜차 길안내로 바로 출발하세요. 내 바이크와 함께 쌓은 주행 기록도 한곳에서 확인할 수 있어요.
```

### Description (4000자 제한)
```
바이커를 위한 지도 앱, 모토맵.

일반 지도에서는 찾기 어려운 바이커 카페, 만남의 광장, 라이딩 코스를 한눈에 확인하고 바로 네비게이션할 수 있습니다.

■ 주요 기능

· 바이커 전용 장소 탐색
바이커 카페, 휴게소, 뷰포인트 등 카테고리별로 검색하세요. 일반 지도에는 없는 라이더 특화 장소 정보.

· 라이딩 추천 코스
난이도와 거리별로 정리된 추천 코스를 지도 미리보기로 확인. 인기 와인딩 코스부터 초보 입문 코스까지.

· 이륜차 전용 길안내
자동차 전용도로를 피하는 추천·시간·거리·큰길 경로를 비교하고 앱 안에서 그대로 안내받으세요. 안내 중 노면 위험을 제보하거나 지도 위 장소로 목적지를 바꿀 수도 있습니다.

· 장소 제보
내가 아는 라이더 스팟을 등록하고 커뮤니티와 공유. 함께 만들어가는 라이더 지도.

· 리뷰 & 사진
방문한 장소에 별점·후기·사진을 남기고 다른 라이더의 경험도 확인. 가본 사람만 아는 디테일.

· 즐겨찾기
자주 가는 카페·코스를 저장하고 빠르게 접근.

· 내 바이크와 주행 기록
내 바이크를 등록하고 어떤 바이크로 어디를 몇 번 다녀왔는지 확인하세요. 기록은 이미지 카드로 공유할 수 있습니다.

· 편한 로그인과 공유 링크
Apple·카카오·네이버·Google 중 원하는 방식으로 로그인하세요. 공유받은 장소·코스 링크는 앱에서 바로 열립니다.

· 다크 모드
야간 라이딩에 최적화된 다크 테마.

라이더가 직접 만들어가는 지도, 모토맵과 함께 달리세요.

---
문의: starhn87@gmail.com
```

### Keywords (100자 제한, 콤마 구분, 공백 없음)
```
바이크,오토바이,라이딩,바이커카페,투어링,와인딩,네비,지도,모터사이클,라이더
```

### Support URL
```
https://github.com/starhn87/motomap/issues
```
> GitHub Issues 페이지. 별도 지원 페이지 없으면 이걸로 충분.

### Marketing URL (선택)
```
https://motomap.kr
```

### Privacy Policy URL
```
https://motomap.kr/privacy
```

### Copyright
```
© 2026 모토맵
```

### What's New (4000자 제한)
```
- 등록 장소와 일반 장소의 상세 화면을 다듬고 리뷰·즐겨찾기 반응을 더 빠르게 개선했어요.
- 현재 지도 주변을 우선 검색하고, 정확히 찾은 장소는 지도에서 바로 보여줘요.
- 검색 결과가 없으면 새 장소를 제보할 수 있고 장소·코스 결과를 더 간결하게 정리했어요.
- 확대·축소 중에도 등록 장소 마커가 일관되게 보이도록 표시 방식과 성능을 개선했어요.
- 밤의 구름·번개 등 날씨 표현과 날씨 상세 화면의 열기·닫기 동작을 다듬었어요.
- 공유 링크가 설치된 앱을 더 안정적으로 열도록 개선했어요.
- 길안내 화면과 잠긴 기기의 로그인 세션 복구 안정성을 높였어요.
```

---

## 5. App Review Information

### Sign-In Information
- **Required**: Yes (일부 기능: 리뷰 작성, 즐겨찾기, 장소 제보)
- **Username**:
  ```
  apple-review@ridemap.app
  ```
- **Password**:
  ```
  (사용자가 생성한 비밀번호 입력 — 영문/숫자/특수문자 8자 이상)
  ```
> ⚠️ 실제로 이 이메일/비밀번호로 회원가입 후 ASC에 입력.

### Contact Information
- **First Name**: (사용자 본인 이름)
- **Last Name**: (사용자 본인 성)
- **Phone Number**: (010-XXXX-XXXX)
- **Email**: starhn87@gmail.com

### Notes for Reviewer
```
[KO]
모토맵은 한국 라이더(오토바이 사용자)를 위한 지도 앱입니다.
주요 기능 안내:

1. 지도·검색·장소·코스 탐색은 로그인 없이 사용할 수 있습니다.
2. 장소 상세의 "도착" 버튼을 누르면 이륜차 경로 미리보기가 열리고, 경로를 선택하면 앱 안에서 길안내가 시작됩니다.
3. 내 정보 탭에서 이메일 로그인 또는 Apple·카카오·네이버·Google 로그인을 사용할 수 있습니다.
4. 로그인 후 리뷰·즐겨찾기·장소 제보·내 바이크·라이딩 기록을 사용할 수 있습니다.
5. 설정의 "연결된 로그인"에서 같은 계정에 다른 로그인 방식을 추가할 수 있습니다.
6. 장소·코스 공유 링크는 앱이 설치된 기기에서 해당 상세 화면을 바로 엽니다.

리뷰어 테스트용 계정:
- Email: apple-review@ridemap.app
- Password: (Sign-In 섹션 참조)

이 계정으로 로그인 후 리뷰 작성/즐겨찾기/제보 기능을 모두 테스트하실 수 있습니다.

User-Generated Content 모더레이션:
- 모든 리뷰/제보에 신고 버튼 제공 (...아이콘 → "신고하기")
- 차단 기능 제공 (...아이콘 → "사용자 차단")
- 부적절 콘텐츠는 24시간 내 검토 및 삭제

위치 정보 사용:
- 현재 위치 표시·주변 검색·이륜차 길안내에 정밀 위치를 사용합니다.
- 로그인한 이용자가 길안내를 끝내면 도착지·경유지·시각을 라이딩 기록과 장소 품질 개선 목적으로 계정에 연결해 저장할 수 있습니다.
- 연속 이동 경로는 서버에 저장하지 않습니다.
- 위치 권한을 거부해도 저장된 장소·코스 탐색은 사용할 수 있습니다.

[EN]
MotoMap (모토맵) is a map app for Korean motorcycle riders, helping them find biker cafes, rest stops, viewpoints, and riding courses that are hard to find on standard maps.

How to test:
1. Map, search, place, and course browsing are available without signing in.
2. In a place detail, tap "도착" (Destination) to preview motorcycle routes, then choose a route to start in-app guidance.
3. The Profile tab supports email sign-in and Sign in with Apple, Kakao, Naver, and Google.
4. After signing in, reviewers can use reviews, favorites, place submissions, My Bike, and ride history.
5. Additional sign-in methods can be linked to the same account under Settings > Connected sign-ins.
6. Shared place and course HTTPS links open the corresponding screen when the app is installed.

Reviewer test account:
- Email: apple-review@ridemap.app
- Password: (see Sign-In section)

User-Generated Content moderation:
- All reviews/submissions have a Report button (... icon → "Report")
- Block users feature (... icon → "Block user")
- Inappropriate content is reviewed and removed within 24 hours

Location usage:
- Precise location is used for showing the rider, nearby search, and motorcycle guidance.
- When a signed-in user ends guidance, the destination, registered-place waypoints, and time may be stored with the account for ride history and place-quality improvement.
- Continuous movement routes are not stored on the server.
- Saved places and courses remain browsable when location permission is denied.
```

### Attachment (선택)
> 데모 영상이나 추가 가이드 PDF가 있으면 첨부. 없어도 무방.

---

## 6. Age Rating

ASC > Age Rating > Edit 에서 설문 답변:

| 항목 | 답변 |
|------|------|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content and Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Contests | None |
| **Unrestricted Web Access** | **No** (외부 지도 앱으로만 이동) |
| **User-Generated Content** | **Yes** (리뷰/제보 기능, 모더레이션 있음) |

**예상 결과: 4+**

> User-Generated Content가 있으니 모더레이션 시스템(신고/차단/검토) 답변 필수.

---

## 7. Export Compliance

ASC > Build > 1.0.0 (xxx) > Export Compliance Information

- **Does your app use encryption?**: No
- **Why?**: HTTPS 통신은 표준 암호화로 면제 대상

> 이미 `app.config.js`에 `ITSAppUsesNonExemptEncryption: false` 설정됨. ASC에서 자동 인식 또는 한 번만 답변.

---

## 8. App Store Connect Account Holder 정보

### App Information > General Information
- **Subtitle**: (위 Subtitle 동일)
- **Privacy Policy URL**: (위 URL 동일)
- **Category**: Navigation / Travel

### Pricing
- Free

### App Review Information
- 위 섹션 참조

---

## 사전 준비 체크리스트

- [ ] Apple Developer Program 가입 승인 완료
- [ ] App Store Connect에서 새 앱 등록 (Bundle ID: com.ridemap.app)
- [ ] EAS 빌드 성공 → TestFlight 업로드
- [ ] 리뷰어용 테스트 계정 생성 (apple-review@ridemap.app)
- [ ] 스크린샷 캡처 완료 (6.9" 필수, 6.5" 권장)
- [ ] 개인정보 처리방침 `https://motomap.kr/privacy` 공개 접근·최종 내용 확인
- [ ] 위 메타데이터 전부 ASC에 복붙
- [ ] App Privacy 설문 답변
- [ ] Age Rating 설문 답변
- [ ] Submit for Review

---

## 자주 묻는 심사 리젝 사유 대비

1. **Privacy Policy 누락/불일치** — `https://motomap.kr/privacy`와 앱의 실제 처리 항목 대조
2. **Demo Account 미제공** — 위 Sign-In Information 필수 입력
3. **앱 설명과 실제 기능 불일치** — Description 작성 후 한 번 더 검수
4. **위치 권한 사용 목적 불명확** — Info.plist의 `NSLocationWhenInUseUsageDescription` 한국어 명확히 (이미 설정됨)
5. **사용자 생성 콘텐츠 모더레이션 부재** — 신고/차단/삭제 흐름 노트에 명시 (위에 작성됨)
6. **빈 카테고리/리스트** — 출시 시점에 최소 코스/장소 데이터 시드 필수

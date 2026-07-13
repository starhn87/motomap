# App Store Connect 제출용 메타데이터

ASC 각 섹션에 그대로 복붙할 수 있도록 정리. 빌드 업로드 후 ASC > My Apps > 모토맵 > 1.0.0 에서 입력.

---

## 1. App Information

### App Name
```
모토맵
```
> 30자 제한. 한국 App Store는 영문/한글 혼용 가능. 검색 노출 최적화를 위해 부제는 따로.

### Subtitle
```
바이커 전용 지도 · 코스 · 리뷰
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
- [x] No, it does not contain, show, or access third-party content
> 외부 콘텐츠를 앱 안에서 표시하지 않음. (카카오맵 연동은 외부 앱 열기라 해당 X)

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
  - 수집 목적: App Functionality (현재 위치 표시, 주변 장소 검색)
  - 트래킹 사용: No
> 위치 정보는 디바이스 내에서만 사용. 서버 저장 X.

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
- Search History (검색은 서버 저장 X)
- Contacts
- Purchases
- Audio Data
- Gameplay Content

### Tracking
- **Does this app track users?**: **No**
> 광고/분석 SDK 없음. Sentry는 자체 운영용이라 tracking 아님.

---

## 4. Version Information (1.0.0)

### Promotional Text (170자 제한)
```
라이더가 직접 만들어가는 지도. 바이커 카페·휴게소·뷰포인트를 한눈에 확인하고 카카오맵·T맵·네이버지도로 바로 출발하세요.
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

· 네비게이션 연동
카카오맵, T맵, 네이버지도, Apple 지도 중 원하는 앱으로 바로 출발. 기본 앱을 설정해두면 한 번에 실행.

· 장소 제보
내가 아는 라이더 스팟을 등록하고 커뮤니티와 공유. 함께 만들어가는 라이더 지도.

· 리뷰 & 사진
방문한 장소에 별점·후기·사진을 남기고 다른 라이더의 경험도 확인. 가본 사람만 아는 디테일.

· 즐겨찾기
자주 가는 카페·코스를 저장하고 빠르게 접근.

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
https://github.com/starhn87/ridemap/issues
```
> GitHub Issues 페이지. 별도 지원 페이지 없으면 이걸로 충분.

### Marketing URL (선택)
```
(비워두기)
```

### Privacy Policy URL
```
https://realman.notion.site/RideMap-개인정보처리방침
```
> ⚠️ 실제 Notion 공개 URL로 교체 필요. (URL은 노션 문서 주소 그대로 — 문서 제목을 모토맵으로 바꾸면 URL도 확인)

### Copyright
```
© 2026 모토맵
```

### What's New (4000자 제한, 신규 출시이므로 간단히)
```
모토맵을 출시합니다.

라이더가 직접 만들어가는 바이커 전용 지도. 바이커 카페·휴게소·뷰포인트·라이딩 코스를 한 곳에서 탐색하고 카카오맵·T맵·네이버지도·Apple 지도로 바로 출발하세요.

피드백과 제안은 언제든 환영합니다.
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

1. 메인 화면(지도) — 비로그인 상태로 모든 장소/코스 탐색 가능
2. 검색 — 상단 검색바에서 장소명 검색
3. 장소 상세 — 마커 탭 → 하단 시트로 정보 표시
4. 네비게이션 연동 — "길찾기" 버튼 탭 시 외부 지도 앱(카카오맵/T맵/네이버지도/Apple 지도) 자동 실행
5. 코스 탭 — 추천 라이딩 코스 목록 → 카드 탭 → 상세 페이지
6. 프로필 탭 — 로그인 후 즐겨찾기/내 리뷰/제보 관리

리뷰어 테스트용 계정:
- Email: apple-review@ridemap.app
- Password: (Sign-In 섹션 참조)

이 계정으로 로그인 후 리뷰 작성/즐겨찾기/제보 기능을 모두 테스트하실 수 있습니다.

User-Generated Content 모더레이션:
- 모든 리뷰/제보에 신고 버튼 제공 (...아이콘 → "신고하기")
- 차단 기능 제공 (...아이콘 → "사용자 차단")
- 부적절 콘텐츠는 24시간 내 검토 및 삭제

위치 정보 사용:
- 사용자 위치는 디바이스에서만 사용 (서버 미저장)
- 권한 거부 시에도 모든 기능 정상 작동 (기본 위치: 서울)

[EN]
MotoMap (모토맵) is a map app for Korean motorcycle riders, helping them find biker cafes, rest stops, viewpoints, and riding courses that are hard to find on standard maps.

How to test:
1. Main screen (map) — Browse all places/courses without login
2. Search — Use the top search bar
3. Place detail — Tap a marker to see info in the bottom sheet
4. Navigation — Tap "Get Directions" to launch an external map app (KakaoMap/TMap/NaverMap/Apple Maps)
5. Courses tab — Browse riding course recommendations
6. Profile tab — After login: manage favorites, reviews, submissions

Reviewer test account:
- Email: apple-review@ridemap.app
- Password: (see Sign-In section)

User-Generated Content moderation:
- All reviews/submissions have a Report button (... icon → "Report")
- Block users feature (... icon → "Block user")
- Inappropriate content is reviewed and removed within 24 hours

Location usage:
- Location is used on-device only (not stored on server)
- All features work without location permission (default: Seoul)
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
- [ ] 개인정보 처리방침 Notion 공개 URL 확정
- [ ] 위 메타데이터 전부 ASC에 복붙
- [ ] App Privacy 설문 답변
- [ ] Age Rating 설문 답변
- [ ] Submit for Review

---

## 자주 묻는 심사 리젝 사유 대비

1. **Privacy Policy 누락/불일치** — Notion 페이지에 수집 항목 전부 명시 확인
2. **Demo Account 미제공** — 위 Sign-In Information 필수 입력
3. **앱 설명과 실제 기능 불일치** — Description 작성 후 한 번 더 검수
4. **위치 권한 사용 목적 불명확** — Info.plist의 `NSLocationWhenInUseUsageDescription` 한국어 명확히 (이미 설정됨)
5. **사용자 생성 콘텐츠 모더레이션 부재** — 신고/차단/삭제 흐름 노트에 명시 (위에 작성됨)
6. **빈 카테고리/리스트** — 출시 시점에 최소 코스/장소 데이터 시드 필수

# 공유 링크

## 활성 원칙

1. 장소는 `https://motomap.kr/place/:id`, 라이딩 추천은
   `https://motomap.kr/riding/:id`를 공유한다. 구 코스의
   `https://motomap.kr/course/:id`도 지원 기간 동안 유지한다.
2. iOS는 `applinks:motomap.kr`와 Apple App Site Association을 통해 해당 URL을
   앱의 같은 경로로 바로 연다.
3. 인앱 브라우저처럼 운영체제가 유니버설 링크를 가로채지 못해 HTTP가
   실행되면 웹은 `ridemap://`의 같은 경로를 먼저 연다. 앱이 실제로 열리면
   `visibilitychange`/`pagehide`로 App Store 폴백을 취소하고, 열리지 않은
   경우에만 App Store로 이동한다.
4. AASA의 팀 ID·번들 ID·경로, `app.config.js`의 `associatedDomains`, 앱 라우트,
   웹 폴백의 커스텀 스킴은 항상 한 묶음으로 검증한다.

## SHARE-001 — 유니버설 링크 실패 시에도 설치 앱을 먼저 연다

- 날짜: 2026-08-23
- 상태: 활성
- 관련 구현: `website/src/index.js`, `website/public/share.js`, `app/place/[id].tsx`,
  `app/riding/[id].tsx`, `app/course/[id].tsx`, `app.config.js`

### 배경

초기 웹 안내는 `ridemap://`로 여는 버튼과 App Store 버튼을 보여줬다. 이후
단계를 줄이기 위해 HTTP에 도달한 모든 공유 링크를 App Store로 302 이동시켰다.
그러나 인앱 브라우저나 같은 도메인에서 시작한 Safari 이동처럼 운영체제가 링크를
가로채지 않는 환경에서는, 앱이 설치돼 있어도 스토어로 바로 빠져버렸다.

### 결정

공유 URL은 유니버설 링크를 1순위로 유지한다. HTTP 응답은 App Store로 무조건
리다이렉트하지 않고 앱의 커스텀 스킴을 즉시 시도하는 가벼운 안내 페이지를
보낸다. 앱으로 전환되지 않은 경우에만 1.4초 후 App Store로 폴백한다. 자동
열기를 막는 브라우저를 위해 `모토맵에서 열기`와 App Store 버튼도 남긴다.

### 검토한 대안과 시행착오

- App Store 302는 미설치 사용자에게는 빠르지만 설치 여부를 알 기회 자체를
  없애므로 사용하지 않는다.
- 웹이 앱 설치 여부를 완벽하게 질의하는 표준 API는 없다. 따라서 운영체제의
  유니버설 링크와 커스텀 스킴 시도, 페이지 숨김 신호를 결합한다.

### 영향과 재검토 조건

도메인·앱 ID·라우트·커스텀 스킴이 바뀌거나 Android 공식 배포를 시작할 때 재검토한다.
메신저 인앱 브라우저가 커스텀 스킴을 차단하는 실제 사례가 생기면 해당 브라우저의
외부 브라우저 열기 가이드를 추가한다.

## SHARE-002 — 라이딩 추천도 같은 유니버설 링크 계약을 사용한다

- 날짜: 2026-08-24
- 상태: 활성
- 관련 구현: `website/src/index.js`, `app/riding/[id].tsx`, `constants/app.ts`

라이딩 추천은 `https://motomap.kr/riding/:id`를 정식 공유 주소로 사용한다. AASA의 허용 경로,
웹 폴백의 `ridemap://riding/:id`, 앱의 expo-router 경로를 함께 추가한다. 이미
`applinks:motomap.kr` entitlement가 포함돼 있어 새 네이티브 설정이나 빌드는 필요하지 않다.
구 `/course/:id`는 웹과 앱에서 계속 받고, 새 앱은 `legacy_course_id`가 연결된 경우 새 라이딩
추천으로 이동하며 연결이 없거나 조회에 실패하면 기존 코스 상세를 연다.

# 오류 수집

앱이 죽거나 처리한 예외를 어디서 모으고, 그 안에 무엇을 남기지 않을지의 기록이다.

관련 구현:

- `lib/errorTracking.ts`, `lib/analytics.ts`, `components/ErrorFallback.tsx`
- `app/_layout.tsx`, `components/ActiveRootLayout.tsx`
- `metro.config.js`, `app.config.js`, `config/posthog-error-tracking.json`
- `scripts/upload-posthog-hermes.mjs`, `.github/workflows/posthog-symbols.yml`, `docs/posthog-upload-secrets.md`

## 먼저 확인할 활성 원칙

1. JS 예외와 iOS 네이티브 크래시는 기존 PostHog 프로젝트로 모은다. 새 Sentry 연동은 만들지 않는다.
2. 콘솔 로그 수집과 세션 리플레이 범위는 늘리지 않는다.
3. 토큰·이메일·정밀 좌표·사용자 입력은 JS로 만드는 예외 페이로드에서 보낸다 전에 지운다.
4. JS scrub은 네이티브 크래시 원문에 적용되지 않는다. 그 경로에 민감 값을 넣지 않는 것으로 보완하고, 지워졌다고 말하지 않는다.
5. 심볼 업로드 키는 분석용 프로젝트 키와 다른 personal API key다. 저장소에 두지 않는다.
6. 기존 PostHog 프로젝트는 EU다. 수집 호스트와 CLI 호스트가 그 쌍과 다르면 보내지 않는다.
7. `nativeCrashes`는 iOS와 Android에서 켠다. Android NDK 크래시도 Android에서만 켠다. ERR-002의 iOS 제한은 ERR-003으로 대체됐다.
8. 네이티브 빌드·OTA·심볼 업로드는 이 결정의 코드가 준비됐다고 실행된 것이 아니다.

## ERR-001 — PostHog로 JS 예외와 iOS 네이티브 크래시를 수집

- 날짜: 2026-11-07
- 상태: 활성. 네이티브 종단 검증은 보류
- 관련 구현: 위 목록. 설치된 SDK는 `posthog-react-native` 4.81.0, `@posthog/react-native-plugin` 2.12.5, 플러그인 podspec의 `posthog-ios` 3.88.2, Expo 57.0.27, React Native 0.86.3

### 배경

제품 분석은 PostHog, 크래시·성능은 Sentry로 나눠 두었다(`docs/analytics-events.md`의 이전 분담).
Sentry 심볼 업로드는 인증 누락으로 반복해서 미완료였다. 개인 모토맵의 오류 수집은 이미 붙어 있는
PostHog로 옮기기로 승인됐다. 회사 Sentry 프로젝트나 회사 자원은 쓰지 않는다.

2026-11-07 공식 문서와 설치된 패키지 선언을 대조했다.

- 미처리 JS 예외·미처리 rejection·`captureException`·`PostHogErrorBoundary`는 JS SDK 설정이다.
- `errorTracking.autocapture.nativeCrashes: true`는 iOS의 미처리 Objective-C 예외, Mach 예외,
  `SIGSEGV`·`SIGABRT`를 포함한 네이티브 크래시를 연다. Android에서는 Java/Kotlin 크래시만 해당하고
  NDK는 `androidNdkCrashes`가 따로다. 이번 범위는 iOS이므로 NDK 수집은 켜지 않는다.
- 네이티브 수집은 `@posthog/react-native-plugin`이 있어야 하고, 없으면 JS 수집만 동작한다.
  플러그인은 이미 의존성에 있고 TestFlight 1.2.11 소스 `4e35c58`의 `package.json`에도 있다.
  설정 플러그인(`posthog-react-native/expo`)은 그때 빌드에 없었다.
- Expo 앱의 공식 iOS 의존성 경로는 CocoaPods다. 문서의 전체 Swift Package Manager 검증은
  Expo가 아니라 React Native 0.87.1 커뮤니티 CLI 앱만 대상으로 하므로 그 경로로 바꾸지 않는다.
- Hermes 소스맵은 `posthog-react-native/metro`의 debug id 플러그인이 번들에 id를 넣고,
  네이티브 빌드는 Xcode 단계가 `posthog-cli hermes upload`를 실행한다.
  `getPostHogExpoConfig(getSentryExpoConfig)`로 감싸면 양쪽이 `options.getDefaultConfig`를
  다시 호출해 설정 로드가 재귀하므로, 그 플러그인을 기존 Sentry Expo 설정 목록에 함께 둔다.
  OTA는 Xcode 단계를 타지 않으므로 `eas update` 또는 export가 만든 디렉터리를
  `posthog-cli hermes upload --directory <dist>`로 따로 올린다.
- 기본 릴리스 연결은 `event`다. 맵은 내용의 debug id로 심볼화되고, 예외의 릴리스는
  `$app_namespace`·`$app_version`·`$app_build`로 붙는다. 같은 바이너리 버전의 OTA 여러 개가
  서로 다른 JS를 실어도 debug id가 맵을 가른다.
- dSYM은 `uploadNativeSymbols`가 prebuild 때 넣는 `posthog-ios`의 `upload-symbols.sh`
  (`posthog-cli dsym upload`)가 올린다. 크래시 바이너리 UUID와 dSYM UUID가 맞아야 심볼화된다.
  `skipOnConflict`는 같은 내용이 이미 있으면 실패 대신 기존 심볼을 유지한다. 이 동작은
  posthog-ios 3.64.7 이상, posthog-cli 0.7.12 이상이다. 설치된 iOS SDK는 3.88.2다.
- `releaseMode: event`를 빌드가 실제로 쓰려면 posthog-cli 0.16.0 이상이 필요하다.
  업로드 스크립트와 `eas-build-post-install`은 2026-11-07 기준 배포판 0.19.0을 고정한다.
- 서버의 Enable exception autocapture가 꺼져 있으면 JS·네이티브 자동 수집이 모두 막힌다.
  이 저장소 작업에서는 프로젝트 설정을 읽거나 바꾸지 않았다.

### 결정

1. 프로덕션 클라이언트(`__DEV__`가 아니고 프로젝트 키가 있을 때)는 미처리 예외, 미처리 rejection,
   iOS 네이티브 크래시를 자동 수집한다. 콘솔 레벨은 빈 배열이다.
2. 인증 복구와 푸시 토큰 동기화처럼 이미 처리해 보고하던 예외는 `captureHandledException`으로
   PostHog에도 남긴다. 기존 Sentry 호출은 이 결정에서 제거하지 않는다. 성능 트레이스도 Sentry에 둔다.
3. 활성 트리의 렌더 오류는 `PostHogErrorBoundary`가 잡고, 라우트 경계는 그 바깥의 렌더 오류를
   처리된 예외로 남긴다. 화면에는 원문과 스택을 보여 주지 않는다.
4. 모든 JS capture에 `before_send`로 이메일, 토큰, 소수점 4자리 이상의 좌표 쌍, 예외 속성의
   검색어·주소·닉네임 같은 입력 키를 지운다. 이 콜백은 설치된 `@posthog/core`에서 큐에 넣기
   전과 `sendImmediate`의 `sendBatch` 전에 실행된다. null을 반환하면 그 이벤트는 큐와 네트워크에
   들어가지 않는다. 제품 이벤트의 `query` 키 자체는 검색 계측 결정을 유지하고, 그 안의
   이메일·토큰·좌표 패턴만 지운다. 수집용 `token` 필드는 지우면 이벤트가 버려지므로 유지한다.
5. `register`와 예외 단계 `app_release`에 앱 버전, 빌드 번호, 런타임, OTA update id, 임베디드/OTA
   구분, 네이티브 브리지, API 계약을 붙인다. JS 예외는 SDK가 추가로 `$app_version`, `$app_build`,
   `$expo_update_id`, `$expo_runtime_version`, `$expo_channel`, `$expo_is_embedded_launch`를 넣는다.
6. 네이티브 빌드의 Hermes 맵과 dSYM 업로드는 `posthog-react-native/expo`에
   `uploadNativeSymbols: true`, `skipOnConflict: true`, `releaseMode: event`로 연결한다.
   네이티브 소스는 올리지 않는다(`includeSource: false`). 자격은 빌드 머신의
   `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`, 선택적 `POSTHOG_CLI_HOST`다.
   dotenv 파일 경로는 플러그인에 넣지 않는다.
7. OTA 맵 업로드는 `node scripts/upload-posthog-hermes.mjs <dist>`다.
   `pull_request`·`push`에서는 거절한다. GitHub workflow `posthog-symbols`는
   `workflow_dispatch`에서 확인 문구 `upload-hermes-sourcemaps`를 입력할 때만 기존 디렉터리를 올린다.
   `eas build`, `eas update`, 스토어 제출은 호출하지 않는다.
8. 개발 전용 프로브는 `lib/errorTrackingProbe.ts`에만 있고 화면에서 부르지 않는다.
   `__DEV__`와 `EXPO_PUBLIC_ERROR_TRACKING_PROBE=1`이 함께일 때만 처리된 JS 예외를 보낸다.
   네이티브 크래시는 이 함수로 일으키지 않는다.

## ERR-002 — EU 프로젝트에만 보내고 네이티브 크래시는 iOS로 제한

- 날짜: 2026-11-07
- 상태: EU 호스트 결정은 활성. Android 수집 제한은 대체됨(ERR-003)
- 관련 구현: `config/posthog-error-tracking.json`, `lib/posthogProject.ts`, `lib/analytics.ts`, `scripts/upload-posthog-hermes.mjs`, `eas.json`

### 배경

`scripts/weekly-digest.mjs`는 기존 프로젝트를 EU 클라우드로 기록하고, 수집 호스트는
`https://eu.i.posthog.com`, private API와 CLI 호스트는 `https://eu.posthog.com`이라고 적는다.
앱 코드의 이전 폴백은 호스트가 비어 있으면 `https://us.i.posthog.com`이었고, 업로드 스크립트는
`POSTHOG_CLI_HOST`가 없으면 CLI 기본값인 미국 앱 호스트를 썼다. 이 저장소의 클라우드 VM에는
`.env`가 없어 그 값을 다시 읽지 않았다. 주간 다이제스트의 명시 호스트와 다르면 전송하지 않는다.

`nativeCrashes`는 공식 SDK에서 iOS와 Android Java/Kotlin을 한 불리언으로 켠다. iOS만 승인됐다.
별도의 iOS 전용 옵션은 문서와 4.81.0 구현에 없다.

### 결정

수집 클라이언트가 켜지는 조건에 `EXPO_PUBLIC_POSTHOG_HOST`가 `https://eu.i.posthog.com`인 경우를
포함한다. 없거나 다른 호스트면 PostHog 클라이언트를 만들지 않는다. 업로드는
`POSTHOG_CLI_HOST`가 `https://eu.posthog.com`이고 수집 호스트도 위의 값일 때만 진행한다.
하나라도 다르면 업로드를 거절한다.

이 항목의 Android 비활성 결정은 ERR-003이 대체한다. EU 호스트 불일치 거절은 유지한다.
공식 Expo 플러그인의 `uploadNativeSymbols`는 iOS dSYM과 Android 심볼 업로드 단계를 함께 등록한다.

검증용 버튼과 `abort()` 네이티브 파일은 `EXPO_PUBLIC_ERROR_TRACKING_PROBE=1`인 번들·prebuild에만
들어간다. 릴리스 번들은 빈 `ErrorTrackingProbeHost`만 포함하고, 프로덕션 프로필은 그 플러그인을
넣지 않는다. 로그인 세션이 있으면 검증 버튼도 렌더하지 않는다.

### 검토한 대안과 시행착오

CLI 기본값인 미국 호스트를 유지하면 기존 EU 프로젝트와 다른 곳으로 심볼이 올라갈 수 있다.
호스트를 추정해 채우지 않고 불일치를 실패로 둔다. 당시에는 Android 크래시를 승인 범위 밖이라
껐고, 그 제한은 ERR-003에서 해제됐다. 플러그인에서 Android 심볼 단계만 제거하는 포크는
공식 설정이 아니라 하지 않는다.

## ERR-003 — iOS와 Android 네이티브 크래시를 보내고, 이벤트 딕셔너리는 전송 전에 지운다

- 날짜: 2026-11-09
- 상태: 활성. 네이티브 종단 검증과 바이너리 첨부 경계는 미완료
- 관련 구현: `patches/@posthog+react-native-plugin+2.12.5.patch`, `lib/posthogProject.ts`, `lib/errorTracking.ts`

### 배경

추가 승인으로 iOS만 수집하던 제한이 풀렸다. 네이티브 페이로드의 개인정보 제거도 적용 대상이다.
공식 React Native 문서와 설치된 `posthog-react-native` 4.81.0 / `@posthog/react-native-plugin`
2.12.5에는 앱이 네이티브 크래시용 redact 콜백을 등록하는 옵션이 없다. JS `before_send`는
네이티브 `$exception`을 보지 못한다.

플러그인 소스가 그 전송 지점을 이미 잡고 있다. iOS는 `config.setBeforeSend`이고, Android는
`addBeforeSend`다. 둘 다 SDK가 이벤트를 보내기 전에 호출한다. 공개 설정으로 이 훅을 넘길 수
없어, 같은 지점에 문자열·민감 키 제거를 `patch-package`로 넣었다.

### 결정

`nativeCrashes`는 iOS와 Android에서 켠다. `androidNdkCrashes`는 Android에서만 켠다. iOS의
`nativeCrashes`가 C/C++ 시그널을 포함하고, Android의 `nativeCrashes`는 Java/Kotlin만 본다.
NDK는 별도 플래그다.

`$exception` 이벤트 딕셔너리는 그 beforeSend에서 JS와 같은 이메일·토큰·좌표 쌍·민감 키를
지운다. 정규식 6개가 준비되지 않거나 처리가 실패하면 iOS는 그 예외를 보내지 않고, Android는
속성 맵을 비운 뒤 고정 문구만 남긴다. `$exception`이 아닌 네이티브 이벤트는 이 패치가 바꾸지
않는다.

이 적용은 이벤트 딕셔너리까지다. posthog-ios와 posthog-android의 크래시 리포터 소스는 이
저장소에 없고, beforeSend에 넘어오는 딕셔너리만 확인했다. tombstone, minidump, 별도 파일
업로드가 그 딕셔너리 밖에 있으면 이 패치는 지우지 못한다. 그 경로가 없다고 말하지 않는다.

검증용 네이티브 종료는 검증 prebuild에만 들어간다. iOS는 `abort()`, Android는 잡히지 않는
백그라운드 `RuntimeException`이다. NDK 신호를 일부러 일으키는 트리거는 없다.

### 검토한 대안과 시행착오

네이티브 수집을 끄는 것이 개인정보에는 안전하지만, 승인된 Android·iOS 크래시 수집을 포기한다.
공식 훅이 생길 때까지 기다리면 이번 승인 범위를 구현하지 못한다. 플러그인 beforeSend에 제거를
넣는 것이 현재 SDK가 제공하는 전송 직전 지점이다.

### 네이티브 경로의 개인정보 한계

JS `before_send`는 네이티브 `$exception`을 보지 못한다. 제거는 ERR-003의 플러그인 beforeSend
패치가 담당하며, 그 패치가 보는 것은 SDK가 넘긴 이벤트 딕셔너리다.

- PostHog `identify`에는 계정 id만 넘긴다. 이메일은 넣지 않는다.
- 예외 단계에는 릴리스 문맥만 넣는다. 검색어, 주소, 좌표, 토큰, 메일, 닉네임을 단계로 남기지 않는다.
- 네이티브 `$exception`은 EU 수집 호스트로 나간다. 딕셔너리 안의 이메일·토큰·좌표 쌍·민감 키는
  beforeSend에서 지운 뒤 전달한다.
- tombstone, minidump, 그 밖의 바이너리 첨부가 beforeSend 밖에 있으면 지우지 못한다. 이 저장소의
  플러그인 소스로는 그 첨부가 없다는 것을 확인하지 못했다. 이 경계는 미완료다.

### 검토한 대안과 시행착오

Sentry를 이번 작업에서 걷어 내면 인증 복구·푸시 진단의 기존 결정을 한 번에 바꾸게 된다.
남기기로 해서 같은 JS 예외가 양쪽 프로젝트에 갈 수 있다. Sentry 제거는 별도 결정이다.

콘솔 autocapture는 렌더 경계와 겹쳐 이중 수집이 되고, 리플레이 콘솔까지 넓어지므로 끄기로 했다.
Android NDK 수집은 처음에 iOS 승인 범위 밖이라 껐고, ERR-003에서 Android 검증 대상으로 다시 켰다.
네이티브 소스 업로드는 저장소 내용을 PostHog에 올리므로 하지 않는다.
플러그인의 `dotenvFile`은 로컬 자격 파일을 빌드에 연결하므로 쓰지 않는다.
전체 SPM 전환은 Expo에서 공식 검증이 없어 CocoaPods를 유지한다.

앱 버전은 올리지 않았다. `unreleasedCandidateVersion`이 1.2.11이라 릴리스 검사는 이 플러그인
변경에 버전 증가를 요구하지 않는다. 업로드 단계가 실제 바이너리에 들어가는 것은 다음 승인 빌드다.

### 아직 하지 않은 검증

아래가 끝나기 전에는 네이티브 오류 수집이 동작한다고 표시하지 않는다.

1. PostHog 프로젝트에서 Enable exception autocapture가 켜져 있는지 확인한다. 이 작업은 설정을 바꾸지 않았다.
2. GitHub Actions와 EAS 빌드 환경에 아래 시크릿이 있다. 값은 저장소와 로그에 없다.
   이 실행에서는 GitHub 시크릿 목록이 403이라 존재 여부를 확인하지 못했다.
   - `POSTHOG_CLI_API_KEY`: `error tracking write`와 `organization read`가 있는 personal API key (`phx_`). `EXPO_PUBLIC_POSTHOG_API_KEY` 재사용 금지.
   - `POSTHOG_CLI_PROJECT_ID`: 숫자 프로젝트 ID.
   - `POSTHOG_CLI_HOST`: `https://eu.posthog.com`. 수집 호스트 `https://eu.i.posthog.com`과 쌍이 아니면 업로드하지 않는다.
   - `EXPO_PUBLIC_POSTHOG_HOST`: `https://eu.i.posthog.com`. 없거나 다른 값이면 클라이언트를 만들지 않는다.
3. 승인된 iOS 네이티브 빌드에서 `eas-build-post-install`이 posthog-cli 0.19.0을 설치하고, Xcode 단계가
   Hermes 맵과 dSYM을 오류 없이 올렸는지 빌드 로그로 확인한다. 이 PR은 그 빌드를 시작하지 않는다.
4. 그 빌드를 설치한 뒤 실제 JS 예외 하나의 스택이 파일·줄로 읽히고, 실제 iOS 네이티브 크래시 하나의
   스택이 심볼화된 프레임으로 읽히는지 PostHog에서 확인한다. 가짜 이벤트로 이 조건을 대체하지 않는다.
5. 그 이벤트의 `$app_version`·`$app_build`가 그 바이너리의 마케팅 버전·빌드 번호와 같고,
   JS 이벤트에는 `$expo_update_id` 또는 슈퍼 속성 `update_id`·`runtime_version`이 있는지 본다.
   네이티브 크래시 원문에는 OTA id가 공식 SDK 필드로 들어가지 않을 수 있다. 그 경우 예외 단계
   `app_release`의 `update_id`만 있다.
6. dSYM UUID와 크래시 바이너리 UUID, Hermes debug id와 업로드한 맵의 debug id가 같은 빌드·같은
   export에서 나왔는지 확인한다. 다른 빌드의 dSYM이나 다른 번들의 맵으로는 심볼화되지 않는다.

현재 1.2.11(71) 바이너리에는 플러그인 소스가 들어 있을 수 있으나 dSYM은 PostHog에 올라가지 않았다.
이 JS를 그 런타임에 OTA하면 `nativeCrashes`가 켜져 심볼 없는 네이티브 크래시가 수집될 수 있다.
그 OTA는 별도 승인이며 이 작업에서 실행하지 않았다.

### 영향과 재검토 조건

PostHog가 네이티브 크래시용 redact 훅을 React Native 설정으로 공개하면 그 훅으로 네이티브 페이로드를
거른 뒤 이 한계 문단을 갱신한다. Sentry 진단을 제거할 때는 AUTH와 푸시 토큰 기록을 함께 개정한다.
CocoaPods trunk가 읽기 전용이 된 뒤 새 posthog-ios가 필요해지면 문서의 하이브리드 SPM 경로를
그때 검증한다. 2026-12-02 이후 새 iOS SDK는 CocoaPods에 올라가지 않는다는 공지가 있다.
현재 고정 버전 3.88.2는 그 전환 전에 받은 버전이다.

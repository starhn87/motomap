# PostHog 심볼 업로드 자격

값을 이 문서나 채팅에 넣지 않는다. 주간 다이제스트가 쓰는 조회 키와 업로드 키는 다른 자격이다.

## 호스트

기존 프로젝트는 EU다. `scripts/weekly-digest.mjs`와 `config/posthog-error-tracking.json`이 같은 값을 가리킨다.

| 용도 | 값 |
|---|---|
| 앱 수집 `EXPO_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` |
| CLI·private API `POSTHOG_CLI_HOST` | `https://eu.posthog.com` |

다른 호스트이거나 비어 있으면 앱은 PostHog를 만들지 않고, `scripts/upload-posthog-hermes.mjs`는 업로드를 거절한다.

## 업로드 키와 조회 키를 섞지 않는다

| 이름 | 쓰는 곳 | 권한 | 넣지 말 것 |
|---|---|---|---|
| `POSTHOG_CLI_API_KEY` | 심볼 업로드 | personal API key (`phx_`). 최소 `error tracking write`, `organization read` | `EXPO_PUBLIC_POSTHOG_API_KEY` (`phc_`), 주간 다이제스트의 `POSTHOG_API_KEY` |
| `POSTHOG_CLI_PROJECT_ID` | 심볼 업로드 | 숫자 프로젝트 ID | 키 문자열 |
| `POSTHOG_API_KEY` | `.github/workflows/weekly-digest.yml`만 | Query read | 업로드 경로 |
| `POSTHOG_PROJECT_ID` | 주간 다이제스트만 | 같은 프로젝트의 숫자 ID일 수 있으나 시크릿 이름은 유지 | `POSTHOG_CLI_PROJECT_ID` 자리에 조회 키를 넣기 |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | 앱 런타임 수집 | 프로젝트 토큰 (`phc_`) | CLI 키 |

## GitHub Actions

워크플로 `.github/workflows/posthog-symbols.yml`는 `workflow_dispatch`에서만 실행된다. pull request와 push에서는 돌지 않고, EAS 빌드·OTA·스토어 제출을 호출하지 않는다.

리포지토리 시크릿으로 읽는다. environment 시크릿이 아니다.

| 변수 | 출처 |
|---|---|
| `POSTHOG_CLI_API_KEY` | `secrets.POSTHOG_CLI_API_KEY` |
| `POSTHOG_CLI_PROJECT_ID` | `secrets.POSTHOG_CLI_PROJECT_ID` |
| `POSTHOG_CLI_HOST` | 워크플로에 고정된 `https://eu.posthog.com` |
| `EXPO_PUBLIC_POSTHOG_HOST` | 워크플로에 고정된 `https://eu.i.posthog.com` |

실행 명령은 `node scripts/upload-posthog-hermes.mjs "$HERMES_DIST_PATH"`다. 스크립트는 위 네 값을 검사한 뒤 `npx @posthog/cli@0.19.0 hermes upload --directory <dist> --release-mode event`를 호출한다. 키는 인자로 넘기지 않고, 출력에서 `phx_`·`phc_`를 가린다.

## EAS

`eas.json`의 `error-tracking-verify`는 `environment: production`이다. 그래서 업로드 키는 EAS production 환경 변수로 둔다. 프로필 env에 키를 적지 않는다.

| 변수 | 프로필 `error-tracking-verify` | production 환경 시크릿 |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` | 같은 값이면 유지 |
| `POSTHOG_CLI_HOST` | `https://eu.posthog.com` | 비우거나 같은 값 |
| `EXPO_PUBLIC_ERROR_TRACKING_PROBE` | `1` | 프로덕션 빌드에는 넣지 않음 |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | 없음 | 기존 앱 토큰. 바꾸지 않음 |
| `POSTHOG_CLI_API_KEY` | 없음 | 여기에 추가 |
| `POSTHOG_CLI_PROJECT_ID` | 없음 | 여기에 추가 |

읽는 경로:

- `package.json`의 `eas-build-post-install`이 `@posthog/cli@0.19.0`을 설치한다. EAS 빌드에서만 실행된다.
- iOS Xcode의 PostHog 번들 단계(`posthog-react-native`의 `tooling/posthog-xcode.sh`)가 Hermes 맵을 올리고, `uploadNativeSymbols`가 넣은 dSYM 단계가 `posthog-cli dsym upload`를 실행한다.
- Android는 같은 플러그인이 `posthog.gradle`과 `com.posthog.android`로 Hermes 맵, ProGuard/R8 매핑, NDK `.so`를 올린다.
- 이 네이티브 단계는 프로세스 환경의 `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`, `POSTHOG_CLI_HOST`를 읽는다. 앱의 `phc_` 토큰은 읽지 않는다.

`error-tracking-verify`는 internal 시뮬레이터 iOS 빌드와 Android APK다. TestFlight와 Play 내부 트랙 제출 설정은 없다. 그 업로드는 실행 전에 별도 승인이 필요하다.

다음 네이티브 빌드 전에 production 환경에 `POSTHOG_CLI_API_KEY`와 `POSTHOG_CLI_PROJECT_ID`가 없으면 심볼 단계가 실패한다. 그 값은 이 저장소 작업에서 만들지 않는다.

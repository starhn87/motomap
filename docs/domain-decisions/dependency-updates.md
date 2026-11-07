# 의존성 업데이트

앱·웹·GitHub Actions의 버전 업데이트를 사람이 검토할 수 있는 수로 유지하기 위한 기록이다.
의존성 버전을 이 결정에서 올리지 않는다.

관련 구현:

- `.github/dependabot.yml`
- `package-lock.json`, `website/package-lock.json`
- `.github/workflows/checks.yml`, `.github/workflows/weekly-digest.yml`

## DEP-001 — Dependabot 주간 업데이트, 생태계별 비메이저 그룹, 버전 PR 상한 3

- 날짜: 2026-11-07
- 상태: 활성
- 관련 구현: `.github/dependabot.yml`

### 배경

저장소에는 Dependabot, Renovate, 자동 병합 워크플로가 없었다. `allow_auto_merge`는 꺼져 있다.
실제로 갱신할 매니페스트는 둘로 나뉜 npm 락파일과 GitHub Actions다.

- npm `/`: 루트 `package.json`과 `package-lock.json`(lockfileVersion 3). 앱 의존성.
- npm `/website`: `website/package-lock.json`(lockfileVersion 3). 사이트 개발 의존성.
- `github-actions` `/`: `checks.yml`, `weekly-digest.yml`의 `actions/checkout@v4`,
  `actions/setup-node@v4`, `denoland/setup-deno@v2`.
- Deno: `supabase/functions/deno.json`과 `deno.lock`, 그리고 `naver-userinfo`,
  `judge-submission`, `moto-chat-v2`의 `deno.json`. 함수 소스에는 `npm:` 인라인 지정이 더 있다.
- `modules/kakao-navi/package.json`은 의존성과 락파일이 없다.
- `supabase/functions/_shared/vendor/jev-decisions/package.json`은 다른 저장소의 벤더 스냅샷이고
  peerDependency만 있다.
- `modules/kakao-navi/ios/KakaoNavi.podspec`만 있고 `Podfile.lock`은 없다. CocoaPods는
  Dependabot 생태계가 아니다.
- Docker, Gradle, pip, Cargo, Terraform, git submodule, Bun, pnpm 매니페스트는 없다.

Dependabot의 `open-pull-requests-limit`는 저장소 전체가 아니라 디렉터리 항목에 적용된다.
`directories`로 여러 경로를 한 항목에 넣어도 한도가 디렉터리마다 적용된 사례가 있다.
dependabot-core#10395는 한도 10과 디렉터리 26개에서 버전 PR 26개가 열린 실험이고,
2026-08-18에 수정 없이 stale로 닫혔다. 그래서 한도를 나누려 `directories`를 쓰지 않고
`directory` 항목을 나눠 항목 한도 1을 각각 둔다.
보안 업데이트는 이 값과 무관하고, GitHub가 고정한 열린 PR 10개 한도를 따로 쓴다.
저장소 전체 한도를 보장하는 설정 키는 없다.

### 결정

Dependabot만 사용한다. 다른 의존성 봇을 겹치지 않는다. 자동 병합 워크플로, 자동 병합 라벨,
`allow_auto_merge` 변경은 하지 않는다.

스케줄은 세 항목 모두 `weekly`, `monday`, `09:00`, `Asia/Seoul`이다. 이 시각은 Dependabot이
지원하는 주간 스케줄이고, 기존 주간 다이제스트(월요일 09:00 KST)와 맞춘 것이다.

비메이저(minor·patch) 버전 업데이트만 생태계 그룹으로 묶는다.

- npm `/`와 npm `/website`: 그룹 `npm-non-major`, `patterns: ["*"]`, `applies-to: version-updates`
- GitHub Actions: 그룹 `actions-non-major`, 같은 조건

메이저 버전 업데이트는 그룹에 넣지 않는다. Dependabot 기본대로 의존성마다 PR을 만든다.
그룹은 보안 업데이트에 적용하지 않는다.

버전 업데이트의 디렉터리 한도는 각각 1이다. 합은 3이다.

| 항목 | 디렉터리 | `open-pull-requests-limit` |
|---|---|---|
| npm | `/` | 1 |
| npm | `/website` | 1 |
| github-actions | `/` | 1 |

한 디렉터리에 비메이저 그룹 PR이 열려 있으면 그 디렉터리의 메이저 PR은 그룹 PR이 병합되거나
닫힐 때까지 열리지 않는다. 이것이 저장소 합 3을 디렉터리 한도로 맞출 때의 대기 방식이다.

Deno 버전 업데이트는 이번 설정에 넣지 않는다. 디렉터리 한도를 하나라도 더하면 버전 PR 상한 3을
유지할 수 없다. 그에 더해 현재 Deno 업데이터는 `deno.json` import map의 `jsr:`·`npm:`만 갱신하고,
함수 소스의 인라인 `npm:` 지정은 갱신하지 않는다. `"lock": { "path": "..." }` 형태의 락 경로도
아직 지원하지 않아, 매니페스트만 바뀌면 `deno task check --frozen`이 깨질 수 있다.
중첩 `deno.json` 두 곳은 부모와 같은 `@typesafe-ai/sdk`를 다시 선언한다.

락파일이 없는 `kakao-navi` 패키지와 벤더 `jev-decisions` 패키지는 npm 항목에 넣지 않는다.
npm `directory`는 하위 디렉터리를 재귀 탐색하지 않으므로 루트 항목이 이 파일들을 집지 않는다.

이 파일은 기본 브랜치에 머지된 뒤에야 Dependabot이 읽는다. 설정 PR만으로는 업데이트 PR이
열리지 않는다.

### 검토한 대안과 시행착오

npm 두 디렉터리를 `directories` 하나와 한도 1로 묶으면 설정은 짧아지지만, 한도가 디렉터리마다
적용되는 동안 버전 PR이 최대 2개가 되어 표의 합 3이 깨진다. 그래서 디렉터리별 항목으로 나눈다.

메이저를 별도 그룹 하나로 묶으면 메이저가 한 PR에 모인다. 요청은 메이저를 비메이저와 분리하는
것이지 메이저끼리 묶는 것이 아니므로, 메이저는 개별 PR로 둔다.

세 생태계에 한도 2를 주면 비메이저 그룹과 메이저 하나가 동시에 열릴 수 있지만, 합이 6이 된다.
합 3을 우선한다.

Deno에 한도 1을 주고 npm 또는 Actions를 빼는 안은, 락파일 재생성이 불완전한 생태계에 슬롯을
쓰고 이미 잠긴 npm·Actions 업데이트를 포기한다. Actions는 메이저 태그라 비메이저 PR이 드물지만,
CI 공급망 업데이트 자체는 업데이터가 지원한다.

Renovate나 두 번째 Dependabot 파일을 두지 않는다. 보안 업데이트 그룹도 만들지 않는다.
보안 업데이트 한도는 저장소 설정에 있고 이 파일로 3 이하로 줄일 수 없다.

### 영향과 재검토 조건

후속 작업은 의존성 봇을 추가하기 전에 이 파일과 열린 Dependabot PR 수를 확인한다.
`open-pull-requests-limit`를 올리거나 `directories`로 합칠 때는 디렉터리 수와 한도의 곱이
버전 PR 3을 넘지 않는지 다시 계산한다.

Deno를 넣을 조건은 다음이 모두 충족될 때다.

- 인라인 `npm:` 지정과 `"lock": { "path": "./deno.lock" }` 재생성을 업데이터가 지원한다.
- 다른 항목의 한도를 줄이거나, 저장소 전체 한도가 생겨 디렉터리 합이 3을 넘지 않는다.
- `deno task check --frozen`이 그 PR에서 통과한다.

Sentry 조직 설정, 회사 리소스, OTA, 스토어 배포는 이 결정의 범위가 아니다.
`@sentry/react-native` 패키지 버전은 다른 npm 의존성과 같이 비메이저 그룹 또는 개별 메이저 PR의
대상이며, 조직 연결을 바꾸지 않는다.

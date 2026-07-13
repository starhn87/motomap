# Maestro 스크린샷 자동화

App Store 제출용 스크린샷을 자동으로 캡처하는 Maestro flow.

## 설치

```bash
# Homebrew (권장)
brew tap mobile-dev-inc/tap
brew install maestro

# 또는 curl
curl -Ls "https://get.maestro.mobile.dev" | bash
```

설치 확인:
```bash
maestro --version
```

## 준비

### 1. 시뮬레이터 디바이스 부팅

App Store 필수 사이즈인 6.9" iPhone 16 Pro Max로 부팅:

```bash
open -a Simulator
# 시뮬레이터 메뉴: File → Open Simulator → iOS 18.x → iPhone 16 Pro Max
```

또는 CLI:
```bash
xcrun simctl boot "iPhone 16 Pro Max"
open -a Simulator
```

### 2. 상태바 9:41 고정 (Apple 관례)

```bash
xcrun simctl status_bar booted override \
  --time "9:41" \
  --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3
```

해제:
```bash
xcrun simctl status_bar booted clear
```

### 3. 앱 빌드 설치

EAS dev build 또는 로컬 빌드 (둘 중 하나):

```bash
# 로컬 빌드 (Xcode 필요)
npx expo run:ios --device "iPhone 16 Pro Max"

# 또는 EAS 빌드 .ipa 다운로드 후 시뮬레이터에 드래그앤드롭
```

## 실행

### 전체 캡처 (권장)

```bash
maestro test .maestro/main.yaml --debug-output ./screenshots
```

`./screenshots/` 디렉토리에 PNG 파일 저장.

### 개별 화면 캡처

```bash
maestro test .maestro/01_main_map.yaml --debug-output ./screenshots
maestro test .maestro/02_courses.yaml --debug-output ./screenshots
maestro test .maestro/03_profile.yaml --debug-output ./screenshots
```

### Maestro Studio (UI 디버깅)

```bash
maestro studio
```

브라우저에서 시뮬레이터의 모든 UI 엘리먼트를 보고 selector를 즉시 테스트 가능.

## 결과 파일 위치

`--debug-output ./screenshots` 옵션 시:
- `./screenshots/<timestamp>/01_main_map.png`
- `./screenshots/<timestamp>/02_search.png`
- ...

옵션 없으면:
- `~/.maestro/tests/<timestamp>/`

## ASC 업로드

1. ASC > My Apps > 모토맵 > 1.0.0 > iOS App > Screenshots
2. **6.9" Display** 섹션에 PNG 드래그앤드롭 (최대 10장)
3. 6.5" Display는 자동으로 동일 이미지 사용됨 (별도 업로드 불필요)

## 트러블슈팅

### `appId not found`
- 시뮬레이터에 모토맵 앱이 설치되어 있는지 확인
- `xcrun simctl listapps booted | grep ridemap`

### `Element not found`
- 화면 전환 애니메이션이 끝나기 전에 다음 액션 실행되는 경우
- `waitForAnimationToEnd: timeout: 5000` 추가

### 위치 권한 다이얼로그
- `permissions: location: allow` 옵션으로 자동 처리됨
- 작동 안 하면 시뮬레이터 설정에서 미리 허용

## Flow 파일 구조

| 파일 | 용도 |
|------|------|
| `main.yaml` | 전체 스크린샷 (7개) 한 번에 |
| `01_main_map.yaml` | 메인 지도만 |
| `02_courses.yaml` | 코스 목록 + 상세 |
| `03_profile.yaml` | 마이 탭만 |
| `config.yaml` | 공통 설정 (현재 placeholder) |

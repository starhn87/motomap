# 모토맵

오토바이 라이더용 지도 앱 (Expo / React Native, iOS·Android). 지도에서 라이더 친화 장소(카페·정비소·용품점·주유소·뷰포인트 등)를 찾고 검색·코스·리뷰·즐겨찾기를 관리한다.

## 핵심 명령

```bash
npm start                    # Expo 개발 서버 (라이브러리 교체 후엔 expo start -c 로 캐시 클리어)
npx tsc --noEmit             # 타입체크 — lint/test 스크립트 없음. 편집 후 항상 실행 (exit 0 확인)
node scripts/seed-*.mjs      # Supabase 시드 (스크립트가 .env 를 직접 로드)
```

### EAS 빌드 / 배포 — `.env` 주입 필수
클라우드 빌드도 로컬 EAS CLI도 로컬 `.env`를 자동으로 안 읽는다. `app.config.js` 평가에서 `KAKAO_NATIVE_APP_KEY` 등이 비면 실패하므로 **항상 셸에 주입**한다:
```bash
set -a; . ./.env; set +a
```
- **OTA (JS만 변경 — 대부분의 작업)**:
  `eas update --channel production --platform ios --message "..."`
  - `--platform ios` **필수** — 기본(`all`)은 `web`(output static) 번들에서 `window is not defined`로 export 실패한다.
  - runtime version이 빌드와 일치해야 적용됨 (app.config `version` ↔ `runtimeVersion: { policy: 'appVersion' }`).
  - 사용자 적용: 앱 **완전 종료 → 재실행(다운로드) → 다시 재실행(적용)**. expo-updates는 cold start에 받아두고 다음 실행에 적용한다.
- **새 빌드 (네이티브/플러그인/expo-updates 설정 변경 시만)**: `eas build -p ios --profile production`
- **submit**: `eas submit -p ios --id <buildId> --profile production` (ASC API key는 EAS 서버에 등록돼 있어 `--non-interactive` 가능)
- ⚠️ expo-updates 이전에 빌드된 바이너리는 OTA를 못 받는다(channel/runtime이 `None`). OTA를 받으려면 expo-updates 포함 빌드를 설치해야 함.

## 아키텍처
- **라우팅**: expo-router (`app/`). 탭은 `app/(tabs)/`, 그 외 `app/course`, `app/ride`, `app/legal`.
- **상태**: 전역은 zustand (`stores/`), 서버 상태/캐싱은 react-query (`hooks/`).
- **백엔드**: Supabase (`lib/supabase.ts`, `lib/api/*`). PostGIS — `places.location`은 `POINT(lng lat)`. 카테고리는 `places_category_check` 제약을 받는다(추가 시 마이그레이션 필요, `supabase/migrations/`).
- **지도**: `@mj-studio/react-native-naver-map`.
- **바텀시트**: `@gorhom/bottom-sheet` v5.
- **애니메이션**: `react-native-reanimated` v4 + `react-native-gesture-handler`.
- **OTA**: expo-updates (channel `production`, runtime `1.1.0`).
- 동적 설정은 `app.config.js`(키는 `process.env`), 빌드 프로필/채널/submit은 `eas.json`.

## 개발 원칙
- **불필요한 추상화는 지양한다.** 때로는 코드 중복이 낫다 — 성급한 추상화보다, 패턴이 충분히 분명해진 뒤에 추상화한다.
- **좋은 코드는 읽기 쉽고 유지보수하기 좋은 코드다.** 영리함보다 명료함을 택한다.
- **백문이불여일견.** 추측하지 말고 직접 확인한다(실행·로그·테스트·코드 읽기). 말로 설명하기보다 동작하는 코드·결과로 보여준다.
- **AI에게 외주를 맡기지 않는다.** 설계와 판단의 주도권, 최종 책임은 사람에게 있다. Claude는 선택지와 근거·트레이드오프를 제시하고, 결정과 검토는 사람의 몫이다.

## 코드 스타일
- 불필요한 `useMemo`/`useCallback` 지양 — 실측상 실효 있을 때만. 정적 값은 모듈 상수, 단순 핸들러는 일반 함수.
- 주석은 한국어. 주변 코드의 밀도·네이밍·관용구에 맞춘다.

## 주의점 (hard-won gotchas)
- **@gorhom/bottom-sheet**: `BottomSheet`에 `animateOnMount={false}`를 둬야 첫 확장 시 마운트 레이아웃 계산 타이밍과 제스처가 안 엉킨다(빼면 마커 탭 직후 첫 확장이 비결정적으로 튕김). 콘텐츠 패닝 + 스크롤은 빠른 드래그에서 충돌 소지가 있는 라이브러리 한계.
- **@mj-studio naver-map**: `NaverMapMarkerOverlay`는 children을 **정적 비트맵으로 한 번 캡처**한다 → 폰트 아이콘은 캡처 타이밍 때문에 안 보일 수 있으니 순수 `View`로 그린다. 마커 `onTap`은 불안정. `coordinateToScreen({latitude,longitude})`는 동작(DP 좌표). `onCameraChanged`의 `reason`은 `'Developer' | 'Gesture' | 'Control' | 'Location'` — 프로그램 이동(`animateCameraTo`='Developer')과 사용자 드래그('Gesture')를 구분할 때 쓴다. `animateCameraTo`의 `zoom`은 옵션. 지도 기본 심벌 탭(`onTapSymbol`)은 라이브러리 미노출이라 **patch-package로 자가 패치**(`patches/`) — 네이티브 3층(spec·iOS·Android) 수정이므로 새 빌드에만 반영되고, 라이브러리 업그레이드 시 패치 재검토 필요. JS는 `SYMBOL_TAP_NATIVE`(runtime ≥ 1.1.3)로 구빌드 폴백 분기.
- **reanimated**: `Animated.View`는 `pointerEvents="box-only"`를 무시한다(plain `View`에서만 적용됨).

## 커밋
적절한 시점마다 최소 논리 단위로 자동 커밋한다. main에 직접, 무관한 변경은 제외. 영어 conventional commit + 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 검증
편집 후 `npx tsc --noEmit`로 타입체크(exit 0). 전용 테스트 러너는 아직 없음.

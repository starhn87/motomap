# 운영 재개 전 패키지 업그레이드 준비 계획

- 작성·조사일: 2026-10-04
- 상태: **2026-10-10 소스·패키지 전환 착수 / 네이티브 빌드·실기기 검증 미착수**
- 코드·lock 기준: `5ed9fee`, 앱 1.2.7, `package-lock.json` v3
- 재개 버전 후보: 1.2.8. 지금 앱 버전·runtime·릴리스 계약은 변경하지 않는다.
- 연결: [성능 계획](performance-optimization-plan.md), [릴리스 정책](domain-decisions/release-compatibility.md),
  [운영 재개 조건](relaunch-readiness.md)

## 2026-10-10 실행 승인과 경계

- 사용자 승인: 최종 Expo 57 권장 조합으로 업데이트하고 메모리·CPU 개선도 검토한다.
- 복원 기준: `f1af77c`의 SDK 54 manifest·lock·네이버 심벌 탭 patch·native 설정 묶음.
- SDK 55/56은 로컬 의존성·정적 검사 단계다. 최종 설치용 후보는 SDK 57 / 앱 1.2.8이며,
  중간 SDK를 TestFlight·production·OTA로 발행하지 않는다.
- 공개 레지스트리 조회, 로컬 설치·patch 적용, 타입·순수 테스트와 논리 단위 커밋까지 허용됐다.
  DB·공급자 복구, prebuild·Pods·codegen·네이티브 빌드, 푸시·제출·OTA·웹 배포는 별도 승인한다.
- 10월 4일 조사표와 준비 단계는 당시 기록으로 보존한다. 현재 실행 결과·새 버전은 아래에 추가한다.
- 패키지 갱신과 자원 해제 수정은 별도 커밋으로 구분한다. 명확한 수명주기 결함은 순수 테스트로
  우선 수정할 수 있지만, CPU·메모리 개선율은 승인된 실기기 측정 전까지 **미측정**이다.
- SDK 57에서 최소 iOS 16.4로 올라가는 지원 범위 변경은 공개 전 확인한다. 구 iOS 이용자를
  위해 1.2.7 중단 안내를 유지하며, 설치할 수 없는 버전으로 업데이트를 강요하는 정책은 배포하지 않는다.

## 1. 준비 범위와 실행 순서 (2026-10-04 기록)

현재는 신고 보완·대기 중이다. 이번 준비는 기존 소스·lock·패치 검토, 공식 릴리스 문서와
npm 공개 메타데이터 조회, 의존성 보안 점검, 문서 작성만 포함한다. 앱 실행, 패키지 설치,
lock 수정, prebuild, 빌드·TestFlight 제출·OTA, DB·지도·인증 공급자 활성화는 하지 않는다.
공개 패키지 레지스트리 조회와 모토맵 운영 API 호출은 구별한다.

실행 순서는 **구버전 보존·최소 측정 → 버전업 → 기능 안정화 → 신버전 전체 측정 → 최적화**다.
업그레이드 자체와 성능 개선 코드를 같은 단계에서 섞지 않는다. 구버전 전체 프로파일링에
시간을 쓰지 않고 최종 사용할 패키지 조합에서 본격 측정한다.

실제 공급자를 사용하는 측정·검증은 [OPS-003](domain-decisions/service-suspension.md)의
신고·보호조치 조건 충족 및 승인 후 공개 상태 `preparing`을 유지한 내부 검증에서만 한다.
중단 게이트를 우회하거나 비교용 구버전 production OTA를 발행하지 않는다.

## 2. 현재 확인된 사실과 목표 후보

현재 버전은 package.json의 범위가 아니라 **lock에 고정된 값**이다. 예를 들어
`@expo/vector-icons`는 선언 `^15.0.3`, lock 15.1.1이며 `@react-navigation/native`는
선언 `^7.1.8`, lock 7.2.2다. 재현성의 기준은 manifest·lock·패치·네이티브 설정의 묶음이다.

2026-10-04 `npm outdated --json`과
[Expo 57.0.26 공식 배포본](https://registry.npmjs.org/expo/-/expo-57.0.26.tgz)의
`bundledNativeModules.json`을 대조했다. `latest`·peer 범위는 후보 발견에만 사용하며 실제 앱의
호환성이 검증된 것으로 해석하지 않는다. 실행 직전에 패치 릴리스·알려진 회귀를 다시 확인한다.

| 묶음 | 현재 lock | 1차 목표 후보·판단 | 검증 위험 |
|---|---|---|---|
| Expo | 54.0.37 | **57.0.26 후보**, 54 → 55 → 56 → 57 단계 전환 | 네이티브 모듈·설정·CNG·툴체인 변화. 중간 SDK는 공개 배포하지 않음 |
| React Native / React / react-dom | 0.81.5 / 19.1.0 / 19.1.0 | Expo 57 매핑 **0.86.3 / 19.2.3 / 19.2.3** | npm 최신 RN 0.87.1·React 19.3.0을 독립적으로 섞지 않음 |
| Reanimated / Worklets / Gesture Handler | 4.2.3 / 0.8.3 / 2.28.0 | Expo 매핑 **4.5.1 / 0.10.1 / ~2.32.0** | 현재 `expo.install.exclude` 예외 재검토, Babel·worklet·시트·pinch 동작 |
| Screens / Safe Area | 4.16.0 / 5.6.2 | Expo 매핑 ~4.26.0 / ~5.7.0 | 탭 복귀·모달·키보드·상하 inset |
| Router·Expo 모듈 | Router 6.0.24, Updates 29.0.20, Image 3.0.11 등 | 해당 SDK 매핑으로 함께 정렬. 57 예: Router ~57.0.24 / Updates ~57.0.24 / Image ~57.0.5 | SDK와 무관하게 개별 `latest` 설치하지 않음. 권한·파일·푸시·세션·링크 API 확인 |
| 네이버 지도 | 2.8.0 + 자체 patch | 2.9.0 후보, patch 재작성·새 RN 검증 전 미확정 | JS 타입뿐 아니라 codegen·iOS·Android 심벌 탭, 좌표 변환·마커 |
| 카카오 로그인 core / user | 2.4.6 / 2.4.6 | 둘 다 2.4.8 후보 | 로그인·취소·계정 연결, KNSDK의 KakaoSDKCommon 의존성과 충돌 여부 |
| KNSDK-UI | Podspec 1.12.14 | Expo 전환 동안 우선 유지. 공식 수정판의 필요성·호환성을 별도 검토 | 비공개 우회·동적 framework·앱 수명주기·이륜차 안전 계약 |
| Bottom Sheet | 5.2.14 | 우선 유지, 목표 RN·애니메이션 조합에서 검증 | v5를 Expo UI의 다른 구현으로 교체하는 작업은 포함하지 않음 |
| Sentry | 7.2.0 | Expo 매핑 **~7.11.0 우선 후보**. 최신 8.29.0은 별도 major 검토 | 초기화·source map·hang·성능 수집·민감 정보·빌드 플러그인 |
| Supabase JS | 2.111.0 | 2.117.2 후보, 설치 시 검증한 정확 버전·lock 고정 | 세션 복원·identity·취소·오류·Storage. DB 변경과 묶지 않음 |
| React Query / Zustand | 5.101.4 / 5.0.14 | 5.104.1 / 5.0.15 후보, 별도 논리 단위 | query 취소·placeholder·refetch·selector·낙관적 반영 |
| PostHog / plugin | 4.61.2 / 2.2.3 | 4.78.4 / 2.12.4 후보, 상호 호환 확인 후 | replay 마스킹·전송·세션·CPU. 표본화 최적화는 업그레이드와 분리 |
| AsyncStorage | 2.2.0 | Expo 매핑도 2.2.0이므로 유지. 최신 3.1.1은 보류 | 일반 설정·캐시 보존. 인증을 SecureStore에서 되돌리지 않음 |
| View Shot / 음성 인식 | 4.0.3 / 3.1.3 | View Shot은 Expo 매핑 5.1.0 후보. 음성 인식 57.1.0은 community 모듈로 별도 검토 | 공유 카드 capture/release, 녹음·음성 권한·취소·언어 |
| Navigation / URL polyfill / Web | 7.2.2 / 3.0.0 / 0.21.2 | Router peer에 맞춰 Navigation 검토, polyfill major 4는 필요성 확인 전 보류, Web은 SDK 매핑 | 라우트·fetch·인증 복귀. motomap.kr 웹 배포는 이번 작업에 포함하지 않음 |
| TypeScript / React 타입 | 5.9.3 / 19.1.17 | TS 5.9 계열 우선 유지, 타입은 React 19.2에 맞춤 | 최신 TS 7.0.2·타입 19.3.0 자동 전환 금지 |
| 기타 도구·JS 패키지 | vector-icons 15.1.1, sharp 0.34.5, tsx 4.23.12 등 | 필요한 보안·호환 수정만 별도 검토. patch-package 8.0.1·base64-arraybuffer 1.0.2는 유지 후보 | 아이콘·이미지 생성·순수 테스트. Anthropic SDK 등 개발 도구 갱신도 앱 SDK 전환과 분리 |

추천 방향은 **Expo 지원 조합을 먼저 완성하고, 독립 라이브러리는 필요·위험별로 나누는 것**이다.
후보 표 전체를 반드시 올려야 재개할 수 있다는 뜻은 아니다. 필요하지 않은 major 갱신은 보류하고,
목표 SDK와 핵심 SDK의 호환성이 막히면 원인을 보고해 목표·재개 범위를 다시 승인받는다.

### 2.1 공식 릴리스에서 확인한 주의점

- Expo는 SDK를 한 단계씩 올리고 SDK에 맞는 의존성 정렬·Doctor·릴리스 노트 확인을 권장한다.
  [공식 업그레이드 절차](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- SDK 55부터 Legacy Architecture 지원이 제거된다. 모토맵은 이미 `newArchEnabled: true`이지만,
  이 설정 항목의 변화와 네이티브 모듈 지원을 재확인해야 한다.
  [SDK 55 릴리스](https://expo.dev/changelog/sdk-55)
- SDK 56은 Hermes V1·Worklets 관련 메모리 회귀가 공지돼 있다. 중간 단계에서 바로 측정·배포하지
  않고 SDK 57 수정 버전까지 진행한다. 초기 57.0.0을 목표로 고정하지 않는다.
  [SDK 56 회귀 공지](https://expo.dev/changelog/sdk-56)
- SDK 57의 메모리·개발 시작 시간 회귀 수정, RN·애니메이션 조합을 확인했다. 모토맵에서 실제 개선됐다는
  뜻은 아니며 전후 측정이 필요하다. Xcode 27/iOS 27 SDK로 빌드할 경우 scene 수명주기 요구와
  Expo의 opt-in 설정을 확인해야 한다. [SDK 57 릴리스](https://expo.dev/changelog/sdk-57)

## 3. 보안·툴체인 준비 결과

- 로컬 확인: Node v22.23.0, Xcode 26.6(17F113). EAS 프로필의 Xcode image는 현재 명시돼 있지 않다.
  이후 빌드에서는 Node·Xcode·CocoaPods·EAS CLI와 실제 image를 확인·기록한다. 재개를 이유로
  Xcode까지 무조건 최신으로 올리지 않는다.
- 2026-10-04 `npm audit --omit=dev` 집계는 **high 37, moderate 16, critical 0**이다.
  이는 영향 패키지·상위 의존성으로 전파된 audit 집계이며 서로 다른 취약점 53개 또는
  실사용 앱 공격 경로 53개라는 뜻은 아니다. Expo·Metro·설정·인증서 등 빌드 도구도 포함된다.
- 자동 `fixAvailable`에 Expo 44.0.6 등 현행보다 낮은 버전이 제안된 경우도 확인했다.
  `npm audit fix --force`, 일괄 `npm update`, `--legacy-peer-deps`로 경고를 덮는 방식은 사용하지 않는다.
- 새 lock에서 audit를 다시 실행해 실제 앱 실행 경로, 빌드/CI 경로, 수정 가능성·호환성을 분류한다.
  도달 가능한 high/critical은 공개 전 수정 또는 명시적인 대응·승인 없이 방치하지 않는다.
  남는 항목은 근거·완화책·재검토 시점을 기록한다. 업그레이드만으로 0건이 된다고 가정하지 않는다.
- Supabase 보안 지침에 따라 클라이언트 정확 버전과 lock을 보존하고, 인증 실패를 해결한다며
  세션 검증·RLS·SecureStore 보호를 낮추지 않는다. 프로젝트·DB·키·스키마는 이번 준비에서 변경하지 않는다.

## 4. 호환성 검토의 핵심 위험

| 위험 | 확인 근거 | 실행 때 확인할 것 |
|---|---|---|
| 네이버 심벌 탭 patch | `patches/@mj-studio+react-native-naver-map+2.8.0.patch`는 spec·타입·iOS·Android를 수정한다. 2.9.0 배포 spec에서도 `onTapSymbol`은 발견되지 않았다. | 새 소스에 의미 단위로 rebase하고 codegen 생성·양 플랫폼 compile·실제 POI 탭을 검증. 파일명만 바꾸거나 patch 실패를 무시하지 않음 |
| KNSDK framework 링크 | `plugins/withKNSDKDynamicFrameworks.js`가 `use_expo_modules!` 위치에 동적 framework hook을 삽입한다. | 새 Podfile의 anchor·Realm/RealmSwift/KakaoSDKCommon/RNCryptor/Alamofire 링크와 설치·실행 dyld 검증 |
| KNSDK 비공개 우회 | NAV-002~004의 `carImageType:`, 접근성 예외 경계, `InfoTitleLabel` 장식 제거 | ABI·구조 확인 및 GPS 유실/복구·안전운행·재탐색·주야간·접근성에서 기본 캐릭터·crash 없는지 |
| 앱·scene 수명주기 | AppDelegate subscriber가 KNSDK 수명주기를 전달한다. Xcode/scene 전환 시 기존 경로가 달라질 수 있다. | 비활성·background·foreground·종료 이벤트의 누락/중복, SDK 미초기화 세션에서 불필요한 초기화 없음 |
| 사용자 상태·저장소 | AUTH-001~005, SecureStore 세션·profiles 정본·JWT 제한 재시도 | 기기 잠금/복귀·자동 identity 통합에도 닉네임·사진·세션 보존. 설정·즐겨찾기 캐시 유지 |
| legacy 파일 API | `lib/uploadImage.ts`에서 `expo-file-system/legacy` 사용 | 목표 SDK 지원 여부·업로드 오류·메모리 확인. API 이전이 필요하면 별도 논리 변경으로 분리 |
| 애니메이션·시트·키보드 | Bottom Sheet·Reanimated·Worklets·Screens 조합 | 첫 시트 진입, 축소/확장, 다시 열기, 사진 pinch/slide, 입력 폼·safe area·터치 즉시 복귀 |
| OTA·운영 재개 게이트 | appVersion runtime, production / internal-testflight, 업데이트 확인·reload | 서로 다른 네이티브 조합에 같은 OTA가 도달하지 않음. suspended/preparing의 fail-closed와 내부 예외 경계 유지 |

네이버 지도 `peerDependencies`의 `react: *`, `react-native: *`는 새 RN에서 모든 동작이 검증됐다는
뜻이 아니다. KNSDK의 고정 1.12.14도 **현재 코드의 값**이지 최신 여부를 확인한 결과가 아니다.
SDK 공급자 수정판을 검토할 때 공식 배포·릴리스 근거를 먼저 확인하고 별도 commit·검증으로 처리한다.

## 5. 실행 단계와 통과 기준

| 단계 | 작업 | 완료 조건·기록 |
|---|---|---|
| U0 · 지금 | 후보·보안·패치·측정 순서 문서화 | manifest/lock/native config 변경 없음, 운영 중단 유지 |
| U1 · 내부 검증 허용 후 | 기존 소스·lock·patch·설정·빌드/OTA ID를 보존하고 구버전 최소 측정 | 실행 가능한 승인된 기존 바이너리에서 S01/S02/S06/S08만 비교 기준으로 수집 |
| U2 | SDK 54 → 55 → 56 → 57 순서로 전환, 각 단계 변경 기록·정적/네이티브 검증 | SDK별 manifest/lock/설정·patch 함께 재현. 중간 SDK를 production/OTA로 배포하지 않음 |
| U3 | 지원 조합이 완성된 뒤 독립 라이브러리·필요한 보안 수정, 전체 기능 안정화 | 아래 회귀 목록 및 릴리스 검사 통과. 버전업 commit과 성능 개선 commit 분리 |
| U4 | 목표 조합을 고정하고 신버전 전체 성능 측정 | 구버전→신버전은 버전업 영향, 신버전→최적화본은 최적화 효과로 구분 |
| U5 | 측정 병목만 개선·재검증, 승인된 재개 릴리스 | 성능 계획·OPS-003·릴리스 정책 순서 준수, 최종 빌드·runtime·문서 일치 |

### 5.1 구버전 기준을 확보할 수 없는 경우

구버전이 중단 게이트·허용 채널·지원 버전 때문에 실행 불가능하면 해당 수치는 **미측정**으로 남긴다.
게이트를 풀거나 구버전 사용자에게 활성 OTA를 보내지 않는다. 과거 Sentry 기록은 참고자료로만
구분하고 새 조건의 실측과 동등한 기준값이라고 하지 않는다. 신버전 기준값부터 시작해 이후
최적화 효과는 비교할 수 있다.

기존 바이너리 보존은 운영 재공개가 아니다. 기준값을 얻으려고 SDK 54 비교본과 SDK 57 최종본을
모두 같은 1.2.8/runtime/channel로 배포하지 않는다. 중간 산출물은 로컬 검증·기록에 한정하며
OTA를 발행하지 않는다. 다른 네이티브 조합을 담은 설치용 비교 빌드가 필요하면 실행 전에
별도 앱 버전·runtime·채널 경계를 릴리스 정책과 함께 승인받는다.

### 5.2 단계별 변경 단위

- 실제 실행 착수 때 원본 commit·lock·패치를 확인하고 복원 기준을 기록한다. 아직 release 태그를 만들지 않았다.
- SDK 단계별로 Expo/RN/React·해당 Expo 모듈·필수 호환 수정만 묶는다. 깨진 patch·peer·codegen을
  둔 채 성공으로 commit하지 않는다. 중간 단계 검증 수준과 남은 runtime 검증을 명시한다.
- 현재 Reanimated/Worklets install exclude는 SDK 권장 조합과 앱의 예외 이유를 확인한 뒤 정리한다.
  권장 버전을 무시하거나 예외를 유지해 경고만 숨기지 않는다.
- CNG 재생성은 생성물·직접 수정·untracked 상태를 먼저 확인해 보호한 뒤 승인된 작업 경계에서 한다.
  네이티브 폴더를 무조건 삭제하거나 기존 사용자 변경을 덮어쓰지 않는다. 모듈·plugin이 기준이다.
- 필요한 독립 JS 클라이언트, 네이티브 SDK, 관찰 도구 변경은 각각 분리한다. TS major 전환,
  UI 라이브러리 교체, 데이터 모델·권한 확대, Visualizer 신규 구현을 끼워 넣지 않는다.
- 실제 새 네이티브 조합의 배포 경계를 결정할 때 `package.json`, release-policy, 릴리스 노트,
  제출 문서·도메인 기록을 함께 동기화한다. 지금은 현행 1.2.7 계약 그대로다.

## 6. 검증 체크리스트

### 자동·빌드 확인 — 실제 업그레이드 단계에서 수행

- [ ] SDK별 의존성 정렬·peer 확인·Expo Doctor 통과, 검증되지 않은 경고의 원인·처리 기록
- [ ] `npx tsc --noEmit`, `npm test`, `npm run check:release` 통과
- [ ] 새 lock에서 보안 점검·주요 advisory 영향 분류, reproducible install의 patch 적용 확인
- [ ] iOS codegen·Pods·서명 release 빌드 및 기기 실행, native framework 누락 없음
- [ ] Android codegen·compile·설정 확인. iOS 전용 길안내를 Android 지원 완료로 표시하지 않음
- [ ] 새 RN에 맞는 DevTools/Hermes 계측 방식과 Sentry 수집 범위·source map·버전 태그 확인

### 실기기 확인 — 신고·보호조치 확인 후 내부 테스트

- [ ] 새 설치·기존 앱 업데이트·cold start·OTA 다운로드/적용·오류 후 재시작
- [ ] 운영 중단·상태 조회 실패·공개 preparing은 SDK 초기화 없이 안전한 화면 유지
- [ ] 승인된 internal-testflight만 preparing에서 내부 진입. production 예외 우회 없음
- [ ] 이메일·Apple·Google·Kakao·Naver 로그인/취소·자동/수동 identity 연결·세션 복귀
- [ ] 모토맵 닉네임·사진·즐겨찾기·리뷰 보존, 잠긴 기기 복귀·JWT 재시도 경계 유지
- [ ] 내 위치 최상위·마커 원형/선택 핀·caption·POI 탭·빠른 줌·windowing 경계
- [ ] 검색 전후 직전 카메라·선택 핀의 시트 제외 중앙·단일/복수/empty 결과
- [ ] 등록/일반 장소·날씨·제보 시트 반복 진입·한 단계 확장·gesture·키보드·레이아웃 안정
- [ ] 사진 slide/pinch·리뷰 오버레이·원본 ±1 마운트·이미지 업로드·공유 카드
- [ ] 이륜차 경로, GPS 유실/복구·안전운행·이탈/재탐색·전체 경로·접근성·background/복귀/종료
- [ ] 기본 바이크·하단 캐릭터 숨김, 커스텀 자차·테마·안전 문구 유지, KNSDK hang/crash 재확인
- [ ] 푸시 권한·token·승인/반려 알림, 딥링크·공유 유입·계정 삭제, 햅틱·음성 검색
- [ ] [공급자 장애 대응](domain-decisions/external-provider-resilience.md)의 1.2.8 필수 목록·장애 주입 완료
- [ ] 원본 위치·토큰·검색어·사진이 계측·replay·보고서에 노출되지 않음

타입·빌드 통과만으로 지도·길안내·gesture 성능이나 사용자 데이터 보존이 검증됐다고 하지 않는다.

## 7. 실패 시 중단·롤백

| 상황 | 대응 |
|---|---|
| patch·Pods·peer·codegen 실패 | 해당 단계에서 멈추고 원인 수정. 경고 우회·SDK 기능 삭제로 전환을 강행하지 않음 |
| 원래 동작·데이터·운영 차단 회귀 | 공개하지 않고 이전 검증된 소스·lock·native config 묶음으로 복원. 필요하면 업그레이드 commit을 revert |
| SDK 57에서 핵심 공급자 미지원 | 최신을 강행하지 않고 검증 가능한 조합·보안 대응·재개 일정을 보고해 선택. SDK 56 회귀를 알고 그대로 출시하지 않음 |
| 새 네이티브 빌드에 SDK 결함 | OTA로 구 SDK를 되돌릴 수 없음. 공개 유지/중단과 수정 바이너리를 별도 판단 |
| 앱/API 계약 차이 | 구버전 계약을 유지하고 최소 실행 버전·원격 최신값을 임의로 올리지 않음 |

## 8. 실행 시 남길 결과

업그레이드 단계별로 날짜, SDK·직접/간접 의존성 diff, manifest·lock·patch commit,
Node/Xcode/빌드 image, 검증 통과/미검증 항목, 보안 잔여 근거, native/OTA 경계,
성능 비교 보고서 링크와 롤백 기준을 기록한다. 원본 로그·trace의 민감 정보는 저장소에 넣지 않는다.

준비 문서가 있다고 실제 업그레이드·보안 수정·성능 검증이 끝난 것은 아니다. 실행은 별도 합의 후
진행하고, 계획 기반 다영역·의존성·네이티브 변경은 검증·커밋까지만 한 뒤 푸시·배포 승인을 받는다.

## 9. 실행 기록 — 2026-10-10

### U2 · Expo 지원 조합의 소스 전환

- SDK 55.0.31: 지원 매핑으로 설치, 심벌 탭 patch 적용·타입 검사·순수 테스트 25개·의존성 검사 통과.
- SDK 56.0.23: 의존성 검사·순수 테스트 25개 통과. Router import 이동·ColorValue·absoluteFill
  호환 수정 확인. TypeScript 권장 버전 6.0.3 전환 후 Node 테스트 타입의 명시 등록이 필요해 최종 단계에서 처리했다.
- SDK 57.0.27: RN 0.86.3 / React 19.2.3 / Reanimated 4.5.1 / Worklets 0.10.1,
  Expo 모듈·Sentry 7.11.0·View Shot 5.1.0을 지원 매핑으로 설치했다.
- TypeScript 6.0.3은 Expo 의존성 검사가 요구하는 버전이다. 원래 TS 5.9 유지 후보를 대체하며,
  npm 최신 major 7을 채택한 것은 아니다. Node 22 타입을 직접 선언하고 테스트 타입을 명시했다.
- Router 56+는 React Navigation을 내부 fork로 바꾸므로 import를 공개 Router entry로 옮겼다.
  외부 navigation 직접 의존성은 제거하고 지도 복귀의 transitionEnd 이벤트 계약은 유지했다.
- RN의 unspecified 테마는 기존 기본 light로 정규화했다. 삭제된 absoluteFillObject는 absoluteFill로
  옮겼다. SDK가 지원하지 않는 newArchEnabled·edgeToEdgeEnabled 설정 및 애니메이션 install 예외는 제거했다.
- 앱/runtime 후보 1.2.8, 직전 1.2.7, native/API 계약 1. 원격 정책·운영 상태는 변경하지 않았다.
- bundle diff 지원을 명시했다. 실제 EAS 차분 전달·크기 절감과 cold start 적용은 아직 검증하지 않았다.
- 최종 정적 검사: 타입·순수 테스트 25개·check:release·expo install --check·Expo Doctor 21/21 통과.
  npm의 전환 중 이전 RN/Reanimated peer 경고는 최종 npm ls의 유효한 지원 조합으로 확인했다.
- 기존 네이버 2.8.0 patch 적용은 통과했지만 지도·로그인·음성의 개별 업데이트는 후속 단위다.
  prebuild·Pods·codegen·서명 빌드·실기기 동작/성능은 **미검증**이다.
- 보안 점검(omit=dev): moderate 12 / high 24 / critical 1. critical shell-quote는 CLI 간접 의존성이고
  별도 보안 수정·경로 분류 대상으로 남겼다. 이 수치는 업그레이드 직후 기록이며 공개 허용 판정이 아니다.

### U3 · 네이버 지도

- wrapper 정확 버전 2.9.1, 양 플랫폼 SDK 3.24.0 후보를 patch로 고정했다(MAP-035).
- 2.8.0 patch는 상류 manager 변경 때문에 무수정 적용에 실패했다. 새 소스에 rebase해 기존
  심벌 탭 계약을 보존했다. 설치된 소스의 SDK·이벤트 연결 테스트를 추가했다.
- 새 SDK의 실제 메모리·CPU 개선, native compile·렌더·마커 회귀는 미검증이다.

### U3 · 카카오 로그인

- core/user를 같은 안정판 2.4.10으로 고정했다. wrapper가 지정한 iOS Kakao SDK는 2.22.1,
  Android는 2.20.1이다. 별도 native 최신 버전을 강제로 섞지 않았다.
- KNSDK-UI의 CocoaPods 공개 배포를 확인했고 최신 안정판이 현재 사용 중인 1.12.14여서 유지한다.
  SDK 내부 지도 downloader의 hang은 해결됐다고 주장하지 않는다.
- 상류 PR #126의 Scene URL callback·React Native SPM 경로 수정은 3.0.0-next.2 계열이다.
  안정판 갱신만으로 해당 수정이 적용됐다고 하지 않는다. native 프로젝트 생성 승인 후 실제
  Swift AppDelegate·SPM 결과와 대조하고 필요한 최소 수정만 backport한다. prerelease major는 설치하지 않았다.
- 타입 검사 통과. 실제 카카오톡→앱 복귀·취소·계정 연결과 KNSDK framework 공존은 빌드 후 검증한다.

### U3 · 음성 인식

- Expo 57 대응 안정판 57.1.1로 고정했다. 기존 한국어·중간 결과·단일 세션·녹음 미저장 설정은 유지했다.
- 타입 검사 통과. 마이크 권한·중단·취소·화면 전환과 실제 iOS/Android 인식은 빌드 후 확인한다.

### U3 · Supabase 클라이언트

- 정확 버전 2.117.3 / lock으로 고정했다. Node 요구 ≥22.0.0에 로컬 22.23.0이 부합한다.
  공개 changelog의 서버 adapter 폐기와 DB minor 변경은 클라이언트 전환과 분리한다.
- SecureStore·processLock·PKCE·프로필 정본·JWT 제한 재시도·RLS는 바꾸지 않았다.
- fake fetch로 프로필 조회/RPC 경로와 AbortSignal이 취소된 TimeoutError의 재요청 금지를 검사했다.
  신호가 취소되지 않은 일반 TimeoutError까지 무조건 취소로 해석하는 것은 상류 계약이 아니므로 검사하지 않는다.
- 타입 검사와 클라이언트 계약 테스트 2개 통과. `npm audit signatures`: 743개 registry signature,
  217개 attestation 검증 통과. 최근 공개 패치 후보는 ignore-scripts로 설치했다.
- 실제 DB query·로그인·계정 연결·Storage·RLS 검증은 운영 복구 승인 후 수행한다. 현재 DB는 열지 않았다.

### U3 · 서버 캐시·로컬 상태

- React Query 5.104.1 / Zustand 5.0.15로 고정했다. 앱의 staleTime·gcTime·retry·selector·persist 형식은 유지했다.
- 타입 검사와 기존 순수 테스트, 취소 뒤 낙관적 캐시 보존·clearStorage 이후 지연 복원 무효화 테스트를 통과했다.
  실제 화면의 낙관적 반영·로그아웃·기존 저장 데이터 복원은 실기기에서 확인한다.

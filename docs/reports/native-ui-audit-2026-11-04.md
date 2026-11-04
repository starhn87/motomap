# 네이티브 UI 적용 후보 검토

2026-11-04. 현재 소스 기준 제안이며 아래 전환·의존성 설치·새 빌드를 승인받거나 구현한 상태가 아니다.
현재 드롭다운 수정은 기존 의존성의 RN 팝오버이며 실제 SwiftUI Menu와 구분한다.

## 추천 순서

| 순서 | 적용 지점 | 현재 구현 | 추천 방향과 이점 | 영향 |
|---|---|---|---|---|
| 1 | 활동 내 제보의 전체/장소/건의 | `SubmissionFilterMenu.tsx`의 우측 RN 팝오버 | iOS Menu/선택형 Picker. 트리거에 붙는 메뉴·선택 체크·접근성·시스템 터치 반응을 OS가 담당 | 새 네이티브 의존성·빌드. Android 기존 메뉴 유지 |
| 2 | 활동의 내 제보/리뷰/알림 | `components/activity/ActivityScreen.tsx`의 직접 만든3분류 | native segmented Picker. 선택 애니메이션·접근성·테마 처리를 표준화 | 새 모듈·빌드. 목록 보존/알림 읽음 경계와 기존3등분 유지 |
| 3 | 설정의 시스템/라이트/다크 | `app/settings.tsx`의 버튼3개 | segmented Picker 또는 선택 메뉴. iOS 설정에 익숙한 선택 UI | 위 모듈 재사용 가능. 즉시 테마 전환·NativeTabs host 상속 회귀 확인 |
| 후순위 | 설정의 짧은 옵션/링크 목록 | `app/settings.tsx`의 커스텀 행/섹션 | 일부 Form/Section/List 전환 비교. 기본 행 간격·선택·큰 글자 대응 표준화 | 전체 화면 교체는 범위가 크다. 버전/햅틱/로그인 행의 기존 동작·헤더·스크롤 여백 보존 |

현재 Expo SDK57에서는 [Menu](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/menu/),
[Picker](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/picker/)를 `@expo/ui`로
사용할 수 있다. Menu는 단일 탭, ContextMenu는 길게 누름이므로 필터에는 Menu/메뉴형 Picker가 맞다.
앱에는 이 모듈이 아직 없으므로 패키지만 추가한 OTA로 사용할 수 없다. SDK57 호환 버전으로
검증하고 새 바이너리를 만든다. SDK 자체 업그레이드는 이 제안에 포함하지 않는다.

### 정정: 운영시간 입력은 현재 노출 기능이 아니다

최초 검토는 `components/submit/TimeField.tsx`에 코드가 남아 있다는 이유로 운영시간 입력을
후보에 넣었으나, 실제 호출처와 도달 가능한 화면을 확인하지 않아 잘못된 제안이었다.
`TimeField`는 현재 참조가 없는 미사용 컴포넌트이고 최초 장소 제보에서는 전화번호·영업시간
입력을 제거했다(제보 간소화 원칙은 `submission-moderation.md` 참조).
운영시간 선택기는 현재 UI 전환 후보에서 제외한다. 향후 기능을 다시 노출하기로 결정할 때만
네이티브 선택기를 검토하며, 그 결정을 이미 내린 것으로 간주하지 않는다.

## 이미 네이티브인 부분

- 하단 NativeTabs와 iOS26 이상 Glass, 공용 GlassSurface의 시스템 재질.
- React Native Switch를 사용하는 햅틱 토글.
- Share/Expo Sharing의 시스템 공유창, Expo ImagePicker의 사진 선택.
- AddressSearchModal의 iOS pageSheet 표시. 내용은 검색/WebView를 유지한다.

## 일괄 전환을 권하지 않는 곳

- 공통 확인창: `lib/dialog.ts`, `DialogHost.tsx`에는 iOS Alert의 가로 버튼 압축·앱 테마·순서 제약
  때문에 커스텀으로 전환한 이유가 있다. 모든 Alert를 되돌리지 않는다. 단순1~2동작만 별도 비교할
  수 있지만 검색 모달 내부·상태/설명/로딩이 있는 확인창은 현재 구조를 보존한다.
- 장소/날씨/위험 바텀시트: 지도와 겹침·단계별 높이·사진·비동기 정보·투표가 앱의 핵심 동작이다.
  전체를 시스템 ActionSheet로 바꾸면 정보와 맥락을 잃는다.
- 전체 헤더: `ActiveRootLayout.tsx`는 AppHeader로 교체해 Glass 뒤로/스크롤 블러/무구분선을
  적용했다. UIKit 내비게이션 바로 일괄 복원하면 최근 명시 요구·safe area와 충돌한다. 단순 하위
  읽기 화면에서만 비교하고 지도/검색/상세 헤더는 유지한다.

먼저 선택 메뉴를 네이티브 모듈 도입으로 검증하고, 이어 활동/테마 선택을 같은
모듈로 적용하는 순서를 추천한다. 라이트/다크·큰 글자·VoiceOver·구형 iOS·Android 폴백과 기존
계정/목록/지도 상태를 검증한다. 네이티브 UI 적용을 Glass 재질의 추가 확대와 동일시하지 않는다.

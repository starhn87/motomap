# 앱 서체

## TYPE-001 — 앱이 소유한 글자에는 Pretendard를 사용한다

- 날짜: 2026-11-04
- 상태: 활성(소스 후보, 새 바이너리 검증 전)
- 관련 구현: `components/ui/AppText.tsx`, `lib/typography.ts`, `app.config.js`,
  `components/ui/NativeSettingsGroup.tsx`, `components/ui/NativeChoiceControl.tsx`

### 배경과 결정

기존 앱은 시스템 서체였다. 사용자 요청으로 Pretendard1.3.9를 네이티브에 미리 등록한다.
`assets/fonts/sources.json`의 공식 릴리스 원본·해시와 SIL OFL1.1 고지를 유지한다.
라이선스 본문의 내용은 유지하고 배포 파일의 행 끝 공백만 정리한다.
원본9굵기100–900은 합계14,078,480bytes(압축 전)이며, 실제 IPA 증가량은 새 빌드 후 측정한다.
가변 TTF보다 크지만 플랫폼별 굵기 매칭의 모호함 없이 현재100–900 사용을 보존하기 위해
정적 OTF를 선택했다. 임의 서브셋·이름 변경·CDN 다운로드는 하지 않는다.

RN Text/Input은 명시적인 공용 래퍼를 사용하고 기존 이벤트·ref·크기·굵기·접근성 배율을
유지한다. RN 내부 기본값·Text.render를 덮거나 UIKit 폰트를 전역 swizzle하지 않는다.
네이티브 SwiftUI 행은 등록된 PostScript명과 Dynamic Type 기준을 사용하고 UIKit 세그먼트와
탭 라벨은 등록된 family를 지정한다. 등록 여부를 확인해 구 설치본은 시스템 폴백을 유지한다.
앱 시작 시 별도 비동기 폰트 로딩이나 최소 스플래시 지연을 추가하지 않는다.

앱이 만든 길안내 도착/위험/주유소 조작부는 등록한 서체와 UIFontMetrics로 Dynamic Type을
유지한다. 앱 소유 하단 WebView는 같은 버전 원본 WOFF2 세 굵기를 로컬 resource bundle에
포함한다. 기존 bundle 디렉터리 read access 안에서만 읽으며 원격 폰트·추가 네트워크·
파일 접근 범위 확대를 하지 않는다. CocoaPods 리소스는 bundle 루트로 복사하므로 CSS는
파일 이름으로 참조하고 CSP는 로컬 font-src 'self'만 추가한다. `Resources/Fonts/sources.json`에 별도 원본·해시를 기록한다.

OS가 소유하는 시스템 메뉴·키보드·알림·공유/사진 선택기, 외부 지도·내비 SDK가 그리는
지명·안내 글자는 공개 API 경계 안에서 시스템/SDK 서체를 유지한다. 글꼴 아이콘의 fontFamily는
변경하지 않는다. 새 앱 소유 화면은 `AppText`를 사용한다. OFL 원문은 앱 설정의 ‘서체 라이선스’
화면에도 포함해 앱과 함께 배포한다.

### 검증과 재검토

새 native41 빌드에서 한글/영문/숫자·장소명2줄·약관·입력 커서/조합·굵기·큰 글자·탭 라벨과
지도/시트 레이아웃을 확인한다. 이전 바이너리의 폴백과 원본 해시는 소스 검사로 확인한다.
새 기기 검증 전에는 서체 적용·성능·최종 다운로드 크기를 확인했다고 기록하지 않는다. 소스 검증에서 타입·523개
JS 테스트·릴리스 계약·diff와 production iOS JS export를 통과했다. 네이티브 앱 빌드는 아직이다.

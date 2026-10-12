# 1.2.8 재개 고지·production 제출 실행 기록

## 승인 범위

2026-10-12 운영자가 Git 푸시, 최신 고지·정상 진입 반영, 새 production 빌드,
남은 GPS 중지 검증 후 심사 제출까지 승인했다. **판매 재개·전체 푸시 알림은 심사 승인 후 별도**다.
소개·공유 화면 복구와 정지된 자동 작업 3개의 재개도 이번 실행에 포함하지 않는다.

약관은 내부 앱에서 이미 적용·동의받은 **2026-10-11**과 기존 동의 버전을 유지하며,
웹의 실제 반영 날짜 **2026-10-12**를 별도로 기록하는 안을 운영자가 확인했다.
기존 동의 timestamp를 변경하거나 새로운 동의를 운영자가 대신 체크하지 않는다.

## Git·웹 반영 완료

- reviewer가 원격 main과 미푸시 16개 커밋을 검토한 뒤 `f0e002e → 71489df`로 main 푸시 완료.
  `.claude/launch.json`, `.agents/`, `.codex/`의 로컬 변경은 포함하지 않았다.
- Cloudflare Worker: `afb17afe-ef19-404a-9ea4-8e76371389fc`.
  `wrangler deploy --keep-vars`로 기존 설정을 보존하고 최신 공통 법률 문서를 배포했다.
- 공개 HTTP 확인: `/service-status` 200, `active`, 최소 앱 1.2.8, `no-store`.
  `/terms`, `/privacy`, `/location-terms` 200이며 10/11 문서와 LOC-003 통지 범위를 확인했다.
  홈페이지·`/place/test`는 503, AASA는 200이다. 상태 전환은 심사팀만이 아니라 호환 설치본에도 적용된다.
- 판매 상태·재개 공지·전체 알림·DB 자동 작업은 변경하지 않았다.

## 새 production 산출물·Apple 업로드 완료

- 소스: `71489df0cd11a8c6ac9275bbda96c170eb6430ca`.
- EAS build ID: `df7912ed-a63e-4171-8fe9-f348b25acdd6`.
- 프로필/채널: `production` / `production`; 앱/runtime 1.2.8, 빌드 **38**.
- Xcode 27 고정, Expo 57, native bridge 2, API 계약 1.
- 깨끗한 임시 Git clone에서 빌드했다. 사용자 미커밋 로컬 파일과 오래된 ignored iOS 생성물을
  업로드하지 않으며 환경은 출력 없이 셸에 주입했다. EAS 서버의 production 환경 변수도 확인했다.
- 빌드 전 `check:release`·`check:legal -- --ready` 통과. EAS 빌드 상태 FINISHED를 확인했다.
  기존 build 36·37 및 내부 채널 바이너리는 심사에 제출하지 않는다.
- 원본 IPA 서명 `codesign --verify --deep --strict` exit 0. 실제 plist에서 bundle
  `com.ridemap.app`, 버전 1.2.8/빌드 38, runtime 1.2.8/채널 production, 최소 iOS 16.4,
  iPhoneOS27 SDK, team QD4486Q3L8, production APNs 및 배포용 `get-task-allow=false`를 확인했다.
  binary의 `location_privacy_stop` 계약 문자열도 확인했다. 실제 native 실행 증거와는 구분한다.
- 원본 IPA SHA256: `464d6f9b80b418df58fc89df8ebd4c4af2656ff73a5445884df63997ddfeb74c`.
- EAS Submit `a89d4d15-bfeb-4d60-afe1-9e4676e413b8`: FINISHED, IOS, error 없음.
  실제 build ID를 지정해 업로드했다. 업로드 완료만으로 Apple 처리·ASC 빌드 선택·심사 접수를
  뜻하지 않는다. 이후 완료한 각 단계는 아래 후속 기록과 구분한다.

### 실기기 검사 사본

App Store 배포 원본은 디버거 연결용 서명이 아니므로 검증 사본만 기존 승인된 개발 프로필과
인증서로 재서명했다. 새 App ID·권한을 등록하지 않았고 기존 프로필의 team·bundle·연결 기기·
만료일을 확인했다. 프레임워크 24개와 앱의 재서명 후 strict 검사를 통과했고 사본을 기존 앱 위에
설치했다. 원본 IPA와 원본 서명은 그대로다. 원본/사본 `main.jsbundle` SHA256은 둘 다
`47c6242ddf6da3e75834649cc4f6fd74f60ef65c9d0081b865940c1d4777f5a0`으로 일치한다.
재서명 사본의 실행 검증을 App Store 서명·TestFlight 원본 설치 검사로 표현하지 않는다.

## GPS 중지 검증 경계

기존 설정 스위치/날씨 기기 검사는 성공했고 LOC-003 팝업 수정의 실기기 반복 검사는 생략한다.
새 검증은 정지 상태의 안내·native 중지·설정 OFF·백그라운드 복귀에 한정한다.
실제 주행, 기존 기록 삭제·전체 철회·새 법률 동의 대리 체크는 하지 않는다.

현재 native 안내가 RN 설정 화면을 덮으므로 안내 위에서 위치 스위치 OFF를 탭할 경로가 없다.
활성 안내의 native 중지 진입점 검사는 개발용 서명 설치본에 디버거로 실행하는 검사와,
안내가 닫힌 후 실제 설정 스위치로 JS 센서/서버 중지·재시작을 실행하는 검사를 구분한다.
개발용 설치본 `1b23728`과 build 38 소스 사이의 `modules/kakao-navi` 차이는 0이다.
이 사실은 새 App Store 서명 산출물의 설치 검증을 대신하지 않는다.
이후 위 build 38 코드의 개발 서명 사본을 설치했고 GPS 검증 러너 컴파일은 exit 0이었다.
실제 아이폰 launch는 Locked로 거절돼 잠금 해제를 요청했다. App Store Connect도 로그인
세션이 만료돼 재로그인을 요청했다. 이 두 사용자 입력 전에는 실제 GPS 검사·심사 제출을 완료하지 않는다.

### 무선 검증 후속

10/12 저녁 연결은 `localNetwork`였으며 페어링된 실제 아이폰의 앱 실행에 성공했다.
USB 케이블을 필수 조건으로 요구하지 않는다. 자동 검증은 UI automation 허용 단계에서
66초 후 timeout으로 종료됐다(`wireless-guidance-stop-1`, exit 65). 테스트 본문에 진입하지
않았으므로 길안내·설정 변경 검사 실패 또는 GPS 중지 성공으로 해석하지 않는다.
당시 기기에서 UI 자동화 허용 여부 확인을 요청했다. 후속 최종 결과는 아래에 기록한다.

### 최종 실기기 결과 — 통과

`wireless-guidance-stop-7.xcresult`: 실제 iPhone 16 / iOS 27.0.1, Passed 1 / Failed 0,
`xcodebuild test-without-building` exit 0. build 38 동일 코드의 개발 서명 사본을 사용했다.
현재 위치 ON·방문 저장 OFF 확인 → RSG 실제 등록 장소 선택 → 경로/안내 시작 →
백그라운드 5초 후 복귀 → main 큐에서 nonnull completion으로 native 중지 호출 → 안내 닫힘 →
실제 설정 스위치 OFF → 백그라운드 15초 후 OFF 유지 → ON 복원·방문 저장 OFF 유지를 확인했다.
활성 안내 위에서 설정 스위치를 탭한 검사라고 표현하지 않는다.

별도 5회차의 private LLDB 관찰은 SDK 허용 gate YES를 기준으로 native 중지의 gate NO와
SDK 매니저의 실제 CoreLocation stop을 확인했다. 별도 Expo 매니저는 원본 CoreLocation start에
도달했고 설정 OFF 경로에서 stopStreaming → CoreLocation stop을 호출했다. SDK의 뒤늦은
시작은 swizzled entry까지만 도달했으며 캡처 구간의 원본 start에는 도달하지 않았다.
이는 SDK 중지·늦은 시작 차단·Expo 분리 검증이며 **전체 OS GPS 종료·모든 콜백 0·모든 SDK
매니저 검증**을 뜻하지 않는다. native 디버거 호출만으로 Expo까지 중지됐다고 표시하지 않는다.

중간 실패도 보존한다: 2회차는 실제 이름 `RSG` 대신 `RSG 성수`를 찾은 fixture 오류,
3·4회차는 디버거 준비 지연/대기 만료, 5회차는 모든 기능 assertion 뒤 이미 종료된 앱을 촬영한
teardown 오류였다. 6회차는 초기 백그라운드 검사 중 디버거 연결로 continuity 확인이 timeout됐다.
러너는 실제 이름·공개 주소 선택, 실패 시 종료, 실행 중인 앱만 촬영하도록 수정했고 7회차는
READY 이후 연결·native 호출 후 즉시 detach하여 최종 성공했다. 앱 소스·production IPA는 변경하지 않았다.
최종 검토에서는 향후 실패 시 화면 수집 오류가 종료를 건너뛰지 않도록 안내 검사의 teardown을
촬영보다 종료 우선으로 보완했다. 이 테스트 러너 후속만 Swift 구문 검사로 확인했고 기기 검사를
반복하지 않았다. 위 7회차 증거는 이 후속 전의 러너 결과다.
기기 실제 주행·기존 리뷰/즐겨찾기 수정·기록 삭제·동의 대리 수락은 하지 않았다.

## App Store Connect 후보 저장

재로그인 후 처음 시도한 저장이 반영되지 않은 것을 확인하고 다시 저장했다.
서버 재조회에서 **1.2.8 (38)** 연결, 최신 한국어 설명·릴리스 노트, 영문/한국어 심사 메모의
방문 저장 기본 OFF·기존 기록 보존·위치 관리·반복 안내 제거 내용을 확인했다.
기존 심사 계정 정보를 보존하며 수동 출시 선택과 판매 중단 상태도 유지했다.
후보 저장은 심사 접수가 아니다. GPS의 위 최종 실기기 검증은 완료했다.
App Privacy의 기존 개인정보 처리방침 URL은 과거 Notion 주소였다. 정식
`https://motomap.kr/privacy`로 변경·저장한 뒤 화면에서 확인했다. ASC 안내대로 다음 버전에
반영되는 URL 수정이며, 별도 앱 판매 재개 또는 새 데이터 유형 게시로 표현하지 않는다.
기존 12개 데이터 유형에는 계정에 연결된 정확한 위치·검색 기록·콘텐츠·진단 등이 포함돼 있다.
PostHog의 alias/identify와 Sentry 사용자 설정은 검색·상호작용·진단의 계정 연결 고지와 맞는다.
음성 파일 업로드·보존은 없고 약관은 OS/Apple 음성인식 처리를 안내한다. 항상 온디바이스라고
표시하지 않는다. [Apple 공식 App Privacy 기준](https://developer.apple.com/app-store/app-privacy-details/)은
Apple 서비스 자체 수집과 앱/외부 SDK가 요청 처리 후 보유하는 수집을 구분한다. 이 흐름에서
Audio 고지 추가가 필요하다는 명확한 근거를 발견하지 않았으며 현재 유형을 임의 변경하지 않았다.
설치 PostHog SDK는 기본 GeoIP 비활성화이며 앱이 이를 변경하지 않는다. 기존 대략 위치의
분석/비연결 고지는 전체 SDK·서버 실제 처리 대조까지 증명하지 못했으므로 후속 확인 대상으로
남긴다. 이 부분을 코드만으로 실제 미수집 또는 익명화 완료라고 단정하지 않는다.

초기 기존 로그는 SDK 백그라운드 허용/차단과 매니저 개수를 표시했지만 전체 OS GPS 종료를
직접 증명하지 않는다. 과거 `2a89939`의 locationd 0/6/0은 **시뮬레이터** 기록이므로 실제
아이폰 증거로 재사용하지 않는다. 새 native API·센서의 검증 범위와 한계는 위 최종 결과를
따르며, 미검증 범위를 완료로 확대하지 않는다. 로그·trace·화면 첨부는 저장소 밖 비공개 임시 폴더에만 둔다.

## 심사 접수 완료

2026-10-12 **20:30 KST** App Store Connect에서 **1.2.8 (38)**을 최종 제출했다.
제출 완료 확인창과 실제 제출 상세의 **심사 대기 중** 상태를 확인했다.

- 제출 ID: `cb70c104-5281-4280-a75a-ca912728a9ef`.
- [App Review 제출 상세](https://appstoreconnect.apple.com/apps/6773636183/distribution/reviewsubmissions/details/cb70c104-5281-4280-a75a-ca912728a9ef).
- 개인정보 처리방침 URL 변경도 이번 제출 항목에 포함됐다.
- 수동 출시 선택·판매 중단을 유지했다. 36·37은 제출하지 않았다.
- 판매 재개·전체 알림·소개/공유·정지 자동 작업 복구는 실행하지 않았으며 승인 후 별도 단계다.
- 심사 상태 자동 추적 작업을 만들지 않았다. 심사 결과는 운영자가 받는 이메일로 확인한다.

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
  실제 build ID를 지정해 업로드했다. **Apple 처리 완료·ASC 빌드 선택·심사 접수 완료는 아직 아니다.**

### 실기기 검사 사본

App Store 배포 원본은 디버거 연결용 서명이 아니므로 검증 사본만 기존 승인된 개발 프로필과
인증서로 재서명했다. 새 App ID·권한을 등록하지 않았고 기존 프로필의 team·bundle·연결 기기·
만료일을 확인했다. 프레임워크 24개와 앱의 재서명 후 strict 검사를 통과했고 사본을 기존 앱 위에
설치했다. 원본 IPA와 원본 서명은 그대로다. 원본/사본 `main.jsbundle` SHA256은 둘 다
`47c6242ddf6da3e75834649cc4f6fd74f60ef65c9d0081b865940c1d4777f5a0`으로 일치한다.
재서명 사본의 실행 검증을 App Store 서명·TestFlight 원본 설치 검사로 표현하지 않는다.

## GPS 중지 검증 경계 — 진행 중

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

현재 기존 로그는 SDK 백그라운드 허용/차단과 매니저 개수를 표시하지만 전체 OS GPS 종료를
직접 증명하지 않는다. 과거 `2a89939`의 locationd 0/6/0은 **시뮬레이터** 기록이므로 실제
아이폰 증거로 재사용하지 않는다. 새 native API 호출·종료 및 OS/센서 관찰 결과가 나오기 전에는
검증 완료로 표시하지 않는다. 로그·trace·화면 첨부는 저장소 밖 비공개 임시 폴더에만 둔다.

## 제출 전 남은 순서

1. 아이폰 잠금 해제 후 남은 GPS 중지 검증과 원상태 복원을 확인한다.
2. App Store Connect 재로그인 후 최신 1.2.8 메타데이터·App Privacy·KO/EN 노트를 동기화한다.
3. Apple 처리 완료 후 **38**을 선택해 수동 출시로 심사 제출한다.
4. 심사 접수 상태를 확인하고 보고한다. 판매 재개·전체 알림은 별도 승인까지 실행하지 않는다.

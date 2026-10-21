## 2026-10-21 native 7 안전운행 화면 차단 후보

**1.2.9 / native 7 / API 1** 로컬 후보다. SDK 안전운행 모드의 렌더 입구를 차단하고,
사후 안전운행 상태가 오면 SDK 뷰를 숨긴다(NAV-015). 목적지 유지·복귀 요청·수동 종료와
시작 음성은 유지한다. 43번에는 이 차단 경계가 없으므로 새 빌드가 필요하며 현재 푸시·
빌드·업로드·심사 재제출은 미실행이다. 새 바이너리에서 시작/도착/오류/이탈/재안내/
지도 이동/메뉴/앱 복귀와 종료·위치 철회를 실기기로 검증한다.

## 2026-10-21 native 6 로컬 후보

사용자가 1.2.9(42) 심사를 취소했다고 알렸다. 다음 후보는 **1.2.9 / native 6 / API 1**이다.
커스텀 시작 음성 “길안내를 시작합니다. 안전한 라이딩 되세요!”와 목적지 주변 안내 유지·
통과 후 원 목적지 복귀 요청(NAV-013/014)을 추가한다. 42번 산출물과 기존 심사 노트에
소급 반영됐다는 의미가 아니다. 새 빌드·업로드·심사 재제출은 아직 하지 않았다.
실제 도착/통과·GPS/오프라인·목적지 변경/종료 경합과 새 음성 청취는 새 바이너리에서 확인한다.

## 2026-10-20 새 production 빌드·심사 제출 승인

사용자가 네이버 교차 감지의 푸시·서버 배포, 새 iOS production 빌드·릴리스 노트 작성·App Store 심사 제출을 명시적으로 승인했다. 버전/runtime은 1.2.9, native 5/API 1이며 기존 수동 출시 설정을 유지한다. 새 production **1.2.9 (42)** 빌드를 완료했다. EAS build `a701ba8c-43d8-4661-91e5-5bbf3926c01d`, source `6f8c756d380d405127c6dacfbd7efc064d3f8f38`이며 다운로드한 산출물의 버전·42번·runtime 1.2.9·production 채널과 음성 우선권/표시 관찰 네이티브 코드를 확인했다. EAS submission `ad13cff8-301f-43f9-a604-ee87f175f4fe`는 약 20분간 IN_QUEUE여서 취소 후 CANCELED를 재확인했다. ASC에 42번 미존재를 확인한 뒤 동일 IPA를 Apple altool로 업로드했고 2026-10-21 00:11 KST 오류 없이 접수됐다(delivery `44c51758-a2bb-4ebd-a621-48ed3a610614`). ASC에서도 1.2.9 (42) 처리 중을 확인했다. ASC 1.2.9 초안에 한국어 릴리스 노트와 현재 개선 사항을 포함한 심사 메모를 저장하고 재조회했다. 기존 심사 로그인·연락처와 수동 출시를 유지했다. 2026-10-21 00:17 KST Apple 처리 완료 후 ASC 1.2.9에 실제 42번을 연결·저장했다. 첫 심사 추가에서 일시적인 예기치 못한 오류가 발생했으나 재조회 후 정상 추가·최종 제출됐고, **심사 대기 중**과 **1개의 항목 제출됨**을 확인했다. Review submission `0a7e34f3-85d5-4891-bf73-7efaca91d21b`, version `49a89b54-9b98-4a04-b65d-9e33ca28823a`. 수동 출시를 유지하며 공개 출시는 하지 않았다. 직접 업로드에 사용한 임시 인증키 파일과 격리 빌드의 `.env`는 작업 후 삭제했다.

새 제출본에는 NAV-010 버튼 표시, NAV-011 음성 우선권, NAV-012 미리보기 가시 영역, 장소 정보 캐시 갱신을 포함한다. 서버의 CURATION-019 네이버 교차 감지는 별도 배포이며 새 앱 권한·정보 수집을 추가하지 않는다.

### 이번 업데이트 심사 메모 초안 (KO/EN)

이번 버전은 기존 길안내 및 장소 정보 표시의 개선입니다. 경로 미리보기에서 출발지와 도착지를 설정하면 상·하단 카드 사이에 전체 경로를 표시합니다. 길안내를 시작한 뒤 지도를 움직이면 SDK 안내 화면에 맞춰 종료·위험 제보 버튼을 표시하고 숨깁니다. 안내 음성 재생 중 다른 앱 오디오에 일시적인 우선권을 요청합니다. 기존 계정·리뷰·즐겨찾기 흐름은 유지합니다.

This update improves existing navigation and place information. Set an origin and destination to preview the route between the top and bottom panels. During navigation, map interactions update the visibility of the End Navigation and Hazard Report buttons with the SDK interface. Voice announcements request temporary audio priority over other apps. Existing account, review, and favorites flows remain available.

실제 심사 계정·연락처는 ASC 현재 저장값을 확인해 유지하며 과거 문서의 서로 다른 계정을 복사하지 않는다.


# App Store Connect 제출용 메타데이터

2026-10-17 NAV-011 업로드 후속: 사용자 승인으로 **1.2.9 (41) / native 5** production
빌드를 완료하고 Apple TestFlight용 업로드를 성공했다. 소스 `fabc840`, runtime 1.2.9,
production 채널, EAS build `5211689e-8e35-4e7a-98a9-cc2500e9b9ab`,
submission `597f22ed-ccf5-4871-abd4-9085d25a2547`. 현재 Apple 처리 중이며 안내 중
음악/영상 감쇠·안내 후 복원과 실제 Bluetooth/전화/취소 검증은 41번에서 수행한다.
이는 App Store 심사·공개 출시 완료를 뜻하지 않는다. 아래 40번/미빌드 준비 이력은 보존한다.


2026-10-17 NAV-011 로컬 후보: **1.2.9 / native 5 / API 1**. 안내 음성 동안만 다른 앱
오디오 감쇠/음성 콘텐츠 중단을 요청하고 종료 후 돌려주는 변경이다. 40번(native 4)에는
미반영이다. 음악·영상·Bluetooth 동시 재생/연속 안내/취소/전화 중단·복귀를 새 바이너리에서
확인해야 하며 이 후보의 푸시·빌드·업로드는 아직 하지 않았다.

2026-10-17 업로드 후속: 사용자 승인으로 새 production **1.2.9 (40) / native 4** 빌드를
완료하고 TestFlight용 Apple 업로드를 성공했다. EAS build
`d6ca7f25-290e-470b-a970-69d738a15658`, source `432f01d`, runtime 1.2.9, production 채널.
EAS submission `31bcbf63-c3fb-490f-8c28-56723a527822`. Apple 처리 후 TestFlight에서
40번을 선택해 정차 상태 탭·팬·핀치·전체 경로·복귀·안전운행과 종료/제보를 확인한다.
현재 실제 제스처 검증 전이며 App Store 심사/공개 출시를 제출한 것은 아니다.
`--what-to-test` 첨부는 EAS Enterprise 제약으로 schedule 단계에서 거절돼 첨부 없이
재요청했다. 실제 생성·업로드된 제출은 위 ID 한 건이다.


2026-10-17 후속 로컬 후보: **1.2.9 / native 4 / API 1**. 기존 TestFlight 39에서
길안내 버튼 잔류가 보고되어 SDK 실제 표시 상태 관찰을 추가했다. 장소 변경 캐시 갱신도 포함한다.
서버 마이그레이션 선행 및 새 빌드의 실제 탭·팬·복귀·안전운행·종료/제보 검증 후 제출한다.
새 후보의 푸시·빌드·업로드·심사는 미실행이다. 아래 이전 후보 이력은 보존한다.

2026-10-16 NAV-010: 다음 로컬 후보는 **1.2.9 / native 3 / API 1**이다. 길안내의 지도 이동·
전체 경로·구간 정보 화면에서는 종료·위험 제보 버튼을 숨기고 일반 안내 화면에서 복원한다.
새 바이너리의 실기기 스와이프·복귀·안전운행·종료/제보 동작을 확인한 뒤 제출 문구를 확정한다.
빌드·설치·TestFlight 업로드·ASC 변경은 아직 하지 않았다. 아래 1.2.8 이력은 그대로 보존한다.

같은 날 후속: 사용자 승인으로 main 푸시와 production **1.2.9 (39)** 빌드를 완료했다.
EAS 상태·소스 `a54fbed`·산출물의 버전/runtime/채널·새 네이티브 selector를 확인했다(NAV-010).
위 준비 시점의 미빌드 상태는 대체됐으며 실기기 설치·TestFlight 업로드·ASC 변경은 미실행이다.

2026-10-13 재개 후속: 공개 App Store 1.2.8을 확인해 미출시 후보 표시를 해제했다. 이후 OTA의
재개 알림 탭→App Store 연결은 새 JS 변경이며 이미 심사된 production38의 제출 노트를
소급 수정하지 않는다. [연결·홈페이지 복구 기록](reports/resume-routing-2026-10-13.md)을 따른다.
이어 사용자 승인으로 main 푸시·홈/공유200·SDK별 13 runtime 연결 OTA를 완료했다.
테스트 알림1건은 Expo/APNs 접수 성공이며 탭 결과 확인 전 전체 방송은 보류한다.

2026-10-13 초기 후속: 심사 승인 후 **1.2.8(38) 수동 출시**와 **175개 국가·지역 선택 저장**을
완료했다. 대한민국 포함 148개 지역은 공개 처리 중, EU 27개국은 거래자 자격 미제공 보류다.
실제 다운로드·업데이트 가능 여부는 [10/13 출시 기록](reports/store-release-2026-10-13.md)으로 구분한다.
전체 푸시는 미발송이며 웹 소개/공유·자동 작업·구버전 OTA는 변경하지 않았다.

2026-10-12 위치정보 후속(LOC-001/LOC-003/OPS-010): 새 동의·중지·철회/열람·삭제 기능과
native bridge 2를 포함한 새 production 빌드가 필요하다. 기존 내부 36/production 후보 37은
제출하지 않는다. 아래 ASC 입력·실기기 결과는 그 이전 후보에 대한 기록이며 새 기능 검증을
대체하지 않는다. 위치 관리 DB 적용·보존 검사와 새 내부 빌드/설치·동의 보기·설정/날씨 검증은
사용자 승인으로 완료했다. 반복 요청 안내 정리는 앱·웹 정본에 동기화했고 이번 수정의 실기기
재검증은 사용자가 생략했다. [최신 증빙과 남은 범위](reports/location-privacy-controls-2026-10-11.md)를
따른다. 후속 승인으로 고지/active 웹 반영과 `71489df` 푸시, 새 production 38 빌드·원본
산출물 검사·Apple 업로드를 완료했다. 남은 GPS 검증 후 ASC 동기화·심사 제출도 승인됐으며 실제 완료 여부는
[10/12 실행 기록](reports/relaunch-submission-2026-10-12.md)으로 구분한다. 판매·전체 알림은 아직 보류다.
10/12 저녁 ASC에서 실제 38 연결과 최신 한국어 설명·릴리스 노트·KO/EN 심사 메모를
저장하고 서버 재조회로 확인했다. App Privacy 대조·정식 개인정보 URL 변경과 최종 무선
실기기 GPS 중지·설정 원복 검사 1/1 뒤, 10/12 20:30 KST **1.2.8 (38)**을 심사에 제출했다.
당시 상태는 **심사 대기 중**이었으며 수동 출시·판매 중단을 유지했다. 세부 증빙은 10/12 실행 기록을 따른다.

아래 1.2.7 메타데이터는 과거 기록이며 그대로 제출하지 않는다.
Expo 57 / 최소 iOS 16.4 조합의 네이티브·실기기 검증과 운영·심사 접근 승인 후
ASC > My Apps > 모토맵 > 1.2.8에 실제 기능·개인정보·리뷰 접근 정보에 맞춘 값을 입력한다.
사용자 승인 후 내부 TestFlight 1.2.8 (36)의 Apple 업로드를 완료했다.
당시 App Store 심사 제출·판매 재개·공개 운영 재개는 미실행이었다. 10/12의 38 심사 접수와 구분한다.
Xcode 27 / iOS 27 SDK 조합의 로컬 내부 Release 설치·기본 길안내/복귀/종료와 콜드/웜
장소 링크 smoke는 통과했다. 로그인 정상 동작은 운영자가 확인했다. 최신 길안내·날씨/유가
실패 대응 소스의 로컬 내부 Release 설치 후 기본 smoke 5개·경로 미리보기 1개도 통과했다.
제공자별 로그인·TestFlight 배포 서명 설치·전체 장애 주입 회귀는 남아 있다.
[실제 검증 범위](reports/release-regression-2026-10-11.md)를 따른다.

## 1.2.8 새로운 기능 초안

아래 한국어 문구는 10/12 ASC 후보에 저장하고 서버 재조회로 확인했다. 최종 심사 접수는 별도다.
CPU·메모리 개선율, 프리 웜업·라이딩 경로 Visualizer의 구현 완료를 주장하지 않는다.

```text
- 앱 실행 기반과 주요 라이브러리를 업데이트했어요.
- iOS 27 앱 실행 호환성을 보완하고 지도 위치 추적의 종료 처리를 개선했어요.
- 로그인 세션 복구와 장소 검색·공유 링크의 오류 대응을 다듬었어요.
- 네이버 지역 검색으로 장소 검색을 보완했어요.
- 집·회사 설정 전에 선택한 장소를 확인할 수 있어요.
- 위치 이용 동의·중지·철회와 본인 기록 열람·삭제를 설정에서 관리할 수 있어요.
- 길안내 초기화·경로 조회 실패 시 안내를 보완했어요.
- 날씨·유가 조회가 실패하면 상태를 확인하고 다시 시도할 수 있어요.
- 기존 바이크 시작 화면을 유지하고 지도 전환을 다듬었어요.
```

### 1.2.8 정상 서비스 진입을 확보한 뒤 제출한다

`preparing`에서 production 앱은 로그인 이전에 차단된다. 아래 과거 리뷰어 계정·노트만으로
진입할 수 있다고 안내하지 않는다. 2026-10-11 OPS-007에 따라 별도 접근 코드는 만들지 않고
고지·운영 준비와 사용자 승인 후 정상 진입을 먼저 연다. 리뷰어 계정과 KO/EN 노트의 실제
접근 절차를 맞춘다. 기존 실기기 기능 검증은 반복하지 않으며 새 production 산출물의
서명·채널·버전·설치·시작을 짧게 확인한다. `internal-testflight` 바이너리를 App Store에
그대로 제출하지 않으며 검증된 소스의 별도 production 빌드 ID를 명시해 제출한다.
[재개 게이트](relaunch-readiness.md)의 운영·심사·공개 승인 경계는 유지한다.

개정 약관 시행일·고지일·동의 버전은 운영자가 재개일로 확정한 2026-10-11이다(OPS-009).
기존 동의는 보존하고 새 명시적 수락을 별도 이력으로 추가한다.

## 1.2.8 운영자·개인정보 고지 동기화 초안

2026-10-11 소스 준비 기준이다. 실제 ASC 입력·웹 배포·법률 검토 완료 기록이 아니다.
`constants/legal.ts`의 운영자·개정안과 `config/legal-publication.json`의 상태/시행일/동의 버전을
기준으로 한다. 현재 소스 상태는 `active`, 시행일·고지일·새 동의 버전은 2026-10-11이다.

- 상호: 모토맵 / 대표자·개인정보 및 위치정보 보호책임자: 이승우
- 사업장 주소: 서울 서대문구 이화여대7길 37, 3층 가9호
- 공개 문의 이메일: starhn87@gmail.com / 전화: 010-9537-8467
- 개인정보 처리방침: `https://motomap.kr/privacy`
- 위치기반서비스 이용약관: `https://motomap.kr/location-terms`
- 서비스 이용약관: `https://motomap.kr/terms`
- 시행일은 2026-10-11이며 신고 수리일 2026-10-08과 구분한다.

현재 문서와 시행일 미정 개정안은 분리한다. 앱의 법률 문서 화면에는 개정안/현재 문서 전환을,
웹에는 각 URL 뒤 `/upcoming` 개정안을 준비했다. 배포 전이므로 공개 URL에 새 고지가
반영됐다고 안내하지 않는다. 준비 중 개정안 URL을 ASC의 정식 Privacy Policy URL로 바꾸지 않는다.
정식 문서는 실제 고지·동의 계약 동기화 후 승격한다.

### 현재 1.2.8 기능 설명 후보

```text
바이크 라이더를 위한 지도, 모토맵.

라이더 친화 장소를 찾고, 라이딩 추천의 목적지를 골라 이륜차 길안내로 출발하세요.

· 지도에서 라이더 친화 장소와 일반 장소를 검색하고, 카카오 검색으로 찾지 못한 장소는 네이버 지역 검색으로 보완해요.
· 라이딩 추천에 담긴 장소를 살펴보고 원하는 목적지로 이동해요.
· 앱 안에서 이륜차 경로를 비교하고 길안내를 이용해요. 실제 도로 상황과 교통 법규가 항상 우선해요.
· 장소 리뷰·사진·즐겨찾기·일반 장소 추천과 장소·위험 제보를 이용할 수 있어요.
· 내 바이크를 등록하고 도착한 장소의 라이딩 기록을 확인해요. 연속 이동 경로를 기록하거나 재생하는 기능은 포함하지 않아요.
· 새 방문·완주 기록은 별도 선택 후 저장하며 설정에서 위치 이용 중지·철회와 본인 기록 관리를 할 수 있어요.
· Apple·카카오·네이버·Google 또는 이메일로 로그인할 수 있어요.
· 장소·라이딩 추천을 링크로 공유하고 날씨·유가를 확인해요.

운영: 모토맵 (대표 이승우)
문의: starhn87@gmail.com
```

### App Privacy 대조 후보

아래는 실제 제품 흐름에 맞춘 대조 기준이다. 10/12 기존 ASC의 12개 데이터 유형을 조회했고,
정확한 위치·검색 기록·콘텐츠·계정 식별·진단 고지를 확인했다. 개인정보 처리방침 URL은
과거 Notion 주소에서 `https://motomap.kr/privacy`로 변경·저장했다(다음 버전 반영).
데이터 유형 추가·삭제나 전체 대조 완료를 이 URL 변경만으로 주장하지 않는다.
법률상 위탁·제공 분류와 Apple의 App Privacy 분류를 같은 개념으로 취급하지 않는다.

| 항목 | 실제 처리와 대조할 고지 |
|---|---|
| Precise Location | 기능별 현재 위치 처리와 계정에 연결된 도착지/경유지 기록. 연속 GPS 경로 미저장이 위치 데이터 미수집을 뜻하지 않음 |
| Search History | 앱 내 검색어 분석·검색 품질 개선. 네이버 API HUB에는 검색어만 보내며 현재 위치·지도 중심·반경·계정 식별자는 보내지 않음 |
| Photos / Other User Content | 프로필·바이크·리뷰·제보 사진과 닉네임·본문 등 실제 업로드 범위 |
| Contact Info / User ID | 이메일·계정 식별자. 소셜 identity가 연결돼도 모토맵 프로필 닉네임·사진 보존 |
| Product Interaction / Diagnostics | PostHog 마스킹된 화면 기록·이벤트, Sentry 오류/성능 진단. 광고 목적 추적 없음 |
| Audio Data | 기기 운영체제 음성인식 사용, 회사 서버 저장 없음. OS 처리와 앱의 데이터 수집 분류는 별도 대조 |

집·회사 도착 기록은 저장 자체를 금지하는 기능이 아니라 라이딩 화면·장소 통계에서 제외하는
기능이다. 탈퇴·삭제 요청 시 파기는 기존 절차를 따른다. 신규 라이딩 추천의 목적지형 이동은
장소 방문 기록을 사용하며, 기존 코스 경로의 완주 저장·조회는 유지한다.

### 1.2.8 심사 메모 후보 (KO/EN)

일반 서비스 진입을 승인 후 연다는 OPS-007 기준이다. 별도 코드·숨은 데모 기능은 없다.
실제로 동작하는 리뷰어 계정은 승인된 계정 정보를 ASC의 Sign-In Information에 입력한다.
현재 ASC에 등록된 `apple_review@motormap.app`의 계정·완료 프로필 존재를 확인했다.
비밀번호·인증 토큰은 저장소에 쓰지 않는다. 실제 URL 복구·production 산출물 확인 후 제출한다.

```text
[KO]
모토맵은 한국 오토바이 라이더를 위한 지도 앱입니다. 심사용 별도 모드 없이 일반 서비스와 같은 기능을 제공합니다.
1. 지도·검색·장소·라이딩 추천 탐색은 로그인 없이 이용할 수 있습니다.
2. 장소 상세의 "도착" 버튼에서 이륜차 경로를 선택해 길안내를 시작할 수 있습니다. 실제 주행은 필요하지 않습니다.
3. 리뷰·즐겨찾기·제보·내 바이크·개인 라이딩 기록은 Sign-In Information에 제공한 계정(apple_review@motormap.app)으로 확인할 수 있습니다.
4. 로그인 후 '방문 기록 저장'을 선택한 이용자가 목적지 300m 이내에서 길안내를 종료하면 목적지·등록 장소 경유지, 기록 시각과 당시 바이크 정보를 계정에 연결해 저장할 수 있습니다. 새 저장 선택은 기본 OFF이며 OFF로 바꿔도 기존 기록을 삭제하지 않습니다.
5. 집·회사로 설정한 위치 근처의 기록은 라이딩 화면과 장소 통계에서 제외됩니다. 서버 저장을 금지하거나 삭제하는 기능은 아닙니다. 연속 이동 경로는 서버에 저장하지 않습니다.
6. 목적지형 라이딩 추천에는 별도 추천 완주 기록을 만들지 않습니다. 기존 코스의 완주 기록·조회 경로는 유지합니다.
7. 카카오 검색으로 찾지 못한 장소는 네이버 API HUB 검색으로 보완합니다. 해당 네이버 요청에는 검색어만 전달하고 현재 위치·지도 범위·계정 식별자는 전달하지 않습니다.
8. 위치 권한을 거부해도 장소·라이딩 추천 탐색은 이용할 수 있습니다. 공유 링크는 설치된 앱에서 해당 상세를 열도록 제공합니다.
9. 현재 위치 기능 이용 전 별도 위치 약관 동의를 받습니다. 설정의 '위치정보 동의·기록 관리'에서 위치 사용 중지·재시작, 동의 범위 및 본인 기록 열람·삭제·철회를 관리할 수 있습니다. 기존 날씨·검색 등 서비스 요청마다 반복 팝업을 표시하지 않으며 확인자료는 유지합니다.
운영·문의: 모토맵 / 이승우 / starhn87@gmail.com / 010-9537-8467

[EN]
MotoMap is a map app for motorcycle riders in Korea. Reviewers use the same service and features as regular users; there is no separate review mode.
1. Map, search, place, and riding recommendation browsing are available without signing in.
2. Tap "도착" (Destination) in a place detail, choose a motorcycle route, and start guidance. Actual riding is not required.
3. Use the account provided in Sign-In Information (apple_review@motormap.app) for reviews, favorites, submissions, My Bike, and personal ride history.
4. When a signed-in user opts into visit-history storage and ends guidance within 300 meters of the destination, destination and registered-place waypoint records, timestamps, and the bike information used at the time may be stored with the account. New storage is OFF by default; switching it OFF does not delete existing records.
5. Records near saved home or work locations are excluded from displayed ride history and place statistics. This does not prevent server storage or delete those records. Continuous movement routes are not stored on the server.
6. Destination-based riding recommendations do not create separate recommendation completion records. Legacy course completion records and their access paths are maintained.
7. Naver API HUB supplements places not found by Kakao search. Only the search query is sent to that Naver service, not the current location, map area, or account identifier.
8. Place and riding recommendation browsing remain available without location permission. Shared links are provided to open the relevant detail in the installed app.
9. Location-service consent is requested separately before current-location features are used. Settings > '위치정보 동의·기록 관리' provides pause/resume, consent-scope controls, and access, deletion, and withdrawal for the user's own records. Routine weather and search service requests do not show repeated pop-ups; usage records are retained.
Operator/contact: MotoMap / 이승우 / starhn87@gmail.com / +82-10-9537-8467
```

대표자 이름은 확인된 한글 표기를 유지했다. ASC Contact Information에 영문 표기를 사용할
경우 운영자가 지정한 정확한 표기를 사용하고 저장소에서 추정하지 않는다.

### 실행 전 확인

`npm run check:legal`은 준비 상태의 정적 동기화만 확인한다.
공개 재개/제출 전에는 `npm run check:legal -- --ready`도 통과시키고 실제 고지·동의 계약·
ASC 설정을 대조한다. 시행일·고지일·동의 버전은 2026-10-11로 확정했다. 준비 검사를 실제 웹 배포·
ASC 제출 완료의 증거로 사용하거나 완료한 기능 검증을 반복하지 않는다.

아래 메타데이터·리뷰어 노트는 **과거 1.2.7 참고 기록**이다. 설명·개인정보·계정·연령 설문은
1.2.8의 실제 동작과 현재 ASC 설정에 대조하기 전 그대로 복사하지 않는다.

---

## 1. App Information

### App Name
```
모토맵
```
> 30자 제한. 한국 App Store는 영문/한글 혼용 가능. 검색 노출 최적화를 위해 부제는 따로.

### Subtitle
```
바이커 장소, 코스, 이륜차 길안내
```
> 30자 제한. 핵심 가치 + 검색 키워드.

### Primary Category
```
Navigation
```

### Secondary Category
```
Travel
```
> Lifestyle도 후보지만 Travel이 라이딩/투어 카테고리에 더 적합.

### Bundle ID
```
com.ridemap.app
```

### SKU (Stock Keeping Unit)
```
ridemap-ios-001
```
> 내부 관리용. 임의 문자열.

### Content Rights
- [x] Yes, and I have the necessary rights to use third-party content
> 네이버 지도·카카오 일반 장소·네이버 API HUB 지역 검색·공공 날씨/유가 정보와 이용자 제보·리뷰를 표시한다. 각 제공 API 약관과 앱 내 신고·차단·운영 검토 절차에 따라 사용한다.
> 네이버 지역 검색은 서버 키·Edge v1 배포와 로컬 내부 실기기 검색 검증을 완료했다. 집/회사 확인창도 내부 실기기에서 확인했지만 TestFlight (36)에는 두 후속이 없다. 실제 제출 시 최신 production 빌드·심사 접근·공개 법률 고지 반영을 다시 확인한다.

---

## 2. Pricing and Availability

- **Price**: Free (0원)
- **Availability**: 대한민국 (Korea, Republic of) 만 선택
> 다국가 출시는 나중 단계. 한국 우선.

---

## 3. App Privacy

> ASC > App Privacy 섹션. 각 데이터 항목별로 답변.

### Data Linked to User (사용자 식별 가능 데이터)

#### Contact Info
- **Email Address**
  - 수집 목적: App Functionality (계정 생성/로그인)
  - 트래킹 사용: No

#### User Content
- **Photos**
  - 수집 목적: App Functionality (리뷰 사진 첨부)
  - 트래킹 사용: No
- **Other User Content** (리뷰 텍스트, 닉네임, 제보 정보)
  - 수집 목적: App Functionality
  - 트래킹 사용: No

#### Identifiers
- **User ID** (Supabase user UUID)
  - 수집 목적: App Functionality
  - 트래킹 사용: No

#### Location
- **Precise Location**
  - 수집 목적: App Functionality, Product Personalization (현재 위치 표시, 주변 장소 검색, 도착·방문 기록)
  - 트래킹 사용: No
> 연속 이동 경로는 저장하지 않지만 로그인 사용자의 도착지·경유지와 시각은 라이딩 기록을 위해 계정에 연결해 저장한다.

#### Search History
- **Search History** (앱 내 장소·코스 검색어)
  - 수집 목적: Analytics, App Functionality (검색 품질·미등록 장소 개선)
  - 트래킹 사용: No

#### Usage Data
- **Product Interaction** (화면 조회, 기능 사용 이벤트, 세션 리플레이)
  - 수집 목적: Analytics, App Functionality
  - 트래킹 사용: No

#### Diagnostics
- **Crash Data**
  - 수집 목적: App Functionality, Analytics (Sentry로 크래시 추적)
  - 트래킹 사용: No
- **Performance Data**
  - 수집 목적: App Functionality, Analytics
  - 트래킹 사용: No

### Data NOT Collected
- Health & Fitness
- Financial Info
- Sensitive Info
- Browsing History
- Contacts
- Purchases
- Audio Data
- Gameplay Content

### Tracking
- **Does this app track users?**: **No**
> PostHog(제품 분석·마스킹된 세션 리플레이)와 Sentry(오류·성능 진단)를 사용하지만 광고 목적의 제3자 데이터 결합이나 데이터 브로커 제공은 하지 않는다.

---

## 4. Version Information (1.2.7)

### Promotional Text (170자 제한)
```
라이더 장소와 코스를 찾고 이륜차 길안내로 바로 출발하세요. 내 바이크와 함께 쌓은 주행 기록도 한곳에서 확인할 수 있어요.
```

### Description (4000자 제한)
```
바이커를 위한 지도 앱, 모토맵.

일반 지도에서는 찾기 어려운 바이커 카페, 만남의 광장, 라이딩 코스를 한눈에 확인하고 바로 네비게이션할 수 있습니다.

■ 주요 기능

· 바이커 전용 장소 탐색
바이커 카페, 휴게소, 뷰포인트 등 카테고리별로 검색하세요. 일반 지도에는 없는 라이더 특화 장소 정보.

· 라이딩 추천 코스
난이도와 거리별로 정리된 추천 코스를 지도 미리보기로 확인. 인기 와인딩 코스부터 초보 입문 코스까지.

· 이륜차 전용 길안내
자동차 전용도로를 피하는 추천·시간·거리·큰길 경로를 비교하고 앱 안에서 그대로 안내받으세요. 안내 중 노면 위험을 제보하거나 지도 위 장소로 목적지를 바꿀 수도 있습니다.

· 장소 제보
내가 아는 라이더 스팟을 등록하고 커뮤니티와 공유. 함께 만들어가는 라이더 지도.

· 리뷰 & 사진
방문한 장소에 별점·후기·사진을 남기고 다른 라이더의 경험도 확인. 가본 사람만 아는 디테일.

· 즐겨찾기
자주 가는 카페·코스를 저장하고 빠르게 접근.

· 내 바이크와 주행 기록
내 바이크를 등록하고 어떤 바이크로 어디를 몇 번 다녀왔는지 확인하세요. 기록은 이미지 카드로 공유할 수 있습니다.

· 편한 로그인과 공유 링크
Apple·카카오·네이버·Google 중 원하는 방식으로 로그인하세요. 공유받은 장소·코스 링크는 앱에서 바로 열립니다.

· 다크 모드
야간 라이딩에 최적화된 다크 테마.

라이더가 직접 만들어가는 지도, 모토맵과 함께 달리세요.

---
문의: starhn87@gmail.com
```

### Keywords (100자 제한, 콤마 구분, 공백 없음)
```
바이크,오토바이,라이딩,바이커카페,투어링,와인딩,네비,지도,모터사이클,라이더
```

### Support URL
```
https://github.com/starhn87/motomap/issues
```
> GitHub Issues 페이지. 별도 지원 페이지 없으면 이걸로 충분.

### Marketing URL (선택)
```
https://motomap.kr
```

### Privacy Policy URL
```
https://motomap.kr/privacy
```

### Copyright
```
© 2026 모토맵
```

### What's New (4000자 제한)
```
- 등록 장소와 일반 장소의 상세 화면을 다듬고 리뷰·즐겨찾기 반응을 더 빠르게 개선했어요.
- 현재 지도 주변을 우선 검색하고, 정확히 찾은 장소는 지도에서 바로 보여줘요.
- 검색 결과가 없으면 새 장소를 제보할 수 있고 장소·코스 결과를 더 간결하게 정리했어요.
- 확대·축소 중에도 등록 장소 마커가 일관되게 보이도록 표시 방식과 성능을 개선했어요.
- 밤의 구름·번개 등 날씨 표현과 날씨 상세 화면의 열기·닫기 동작을 다듬었어요.
- 공유 링크가 설치된 앱을 더 안정적으로 열도록 개선했어요.
- 길안내 화면과 잠긴 기기의 로그인 세션 복구 안정성을 높였어요.
```

---

## 5. App Review Information

### Sign-In Information
- **Required**: Yes (일부 기능: 리뷰 작성, 즐겨찾기, 장소 제보)
- **Username**:
  ```
  apple-review@ridemap.app
  ```
- **Password**:
  ```
  (사용자가 생성한 비밀번호 입력 — 영문/숫자/특수문자 8자 이상)
  ```
> ⚠️ 실제로 이 이메일/비밀번호로 회원가입 후 ASC에 입력.

### Contact Information
- **First Name**: (사용자 본인 이름)
- **Last Name**: (사용자 본인 성)
- **Phone Number**: (010-XXXX-XXXX)
- **Email**: starhn87@gmail.com

### Notes for Reviewer
```
[KO]
모토맵은 한국 라이더(오토바이 사용자)를 위한 지도 앱입니다.
주요 기능 안내:

1. 지도·검색·장소·코스 탐색은 로그인 없이 사용할 수 있습니다.
2. 장소 상세의 "도착" 버튼을 누르면 이륜차 경로 미리보기가 열리고, 경로를 선택하면 앱 안에서 길안내가 시작됩니다.
3. 내 정보 탭에서 이메일 로그인 또는 Apple·카카오·네이버·Google 로그인을 사용할 수 있습니다.
4. 로그인 후 리뷰·즐겨찾기·장소 제보·내 바이크·라이딩 기록을 사용할 수 있습니다.
5. 설정의 "연결된 로그인"에서 같은 계정에 다른 로그인 방식을 추가할 수 있습니다.
6. 장소·코스 공유 링크는 앱이 설치된 기기에서 해당 상세 화면을 바로 엽니다.

리뷰어 테스트용 계정:
- Email: apple-review@ridemap.app
- Password: (Sign-In 섹션 참조)

이 계정으로 로그인 후 리뷰 작성/즐겨찾기/제보 기능을 모두 테스트하실 수 있습니다.

User-Generated Content 모더레이션:
- 모든 리뷰/제보에 신고 버튼 제공 (...아이콘 → "신고하기")
- 차단 기능 제공 (...아이콘 → "사용자 차단")
- 부적절 콘텐츠는 24시간 내 검토 및 삭제

위치 정보 사용:
- 현재 위치 표시·주변 검색·이륜차 길안내에 정밀 위치를 사용합니다.
- 로그인한 이용자가 길안내를 끝내면 도착지·경유지·시각을 라이딩 기록과 장소 품질 개선 목적으로 계정에 연결해 저장할 수 있습니다.
- 연속 이동 경로는 서버에 저장하지 않습니다.
- 위치 권한을 거부해도 저장된 장소·코스 탐색은 사용할 수 있습니다.

[EN]
MotoMap (모토맵) is a map app for Korean motorcycle riders, helping them find biker cafes, rest stops, viewpoints, and riding courses that are hard to find on standard maps.

How to test:
1. Map, search, place, and course browsing are available without signing in.
2. In a place detail, tap "도착" (Destination) to preview motorcycle routes, then choose a route to start in-app guidance.
3. The Profile tab supports email sign-in and Sign in with Apple, Kakao, Naver, and Google.
4. After signing in, reviewers can use reviews, favorites, place submissions, My Bike, and ride history.
5. Additional sign-in methods can be linked to the same account under Settings > Connected sign-ins.
6. Shared place and course HTTPS links open the corresponding screen when the app is installed.

Reviewer test account:
- Email: apple-review@ridemap.app
- Password: (see Sign-In section)

User-Generated Content moderation:
- All reviews/submissions have a Report button (... icon → "Report")
- Block users feature (... icon → "Block user")
- Inappropriate content is reviewed and removed within 24 hours

Location usage:
- Precise location is used for showing the rider, nearby search, and motorcycle guidance.
- When a signed-in user ends guidance, the destination, registered-place waypoints, and time may be stored with the account for ride history and place-quality improvement.
- Continuous movement routes are not stored on the server.
- Saved places and courses remain browsable when location permission is denied.
```

### Attachment (선택)
> 데모 영상이나 추가 가이드 PDF가 있으면 첨부. 없어도 무방.

---

## 6. Age Rating

ASC > Age Rating > Edit 에서 설문 답변:

| 항목 | 답변 |
|------|------|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content and Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Contests | None |
| **Unrestricted Web Access** | **No** (외부 지도 앱으로만 이동) |
| **User-Generated Content** | **Yes** (리뷰/제보 기능, 모더레이션 있음) |

**예상 결과: 4+**

> User-Generated Content가 있으니 모더레이션 시스템(신고/차단/검토) 답변 필수.

---

## 7. Export Compliance

ASC > Build > 1.0.0 (xxx) > Export Compliance Information

- **Does your app use encryption?**: No
- **Why?**: HTTPS 통신은 표준 암호화로 면제 대상

> 이미 `app.config.js`에 `ITSAppUsesNonExemptEncryption: false` 설정됨. ASC에서 자동 인식 또는 한 번만 답변.

---

## 8. App Store Connect Account Holder 정보

### App Information > General Information
- **Subtitle**: (위 Subtitle 동일)
- **Privacy Policy URL**: (위 URL 동일)
- **Category**: Navigation / Travel

### Pricing
- Free

### App Review Information
- 위 섹션 참조

---

## 사전 준비 체크리스트

- [ ] Apple Developer Program 가입 승인 완료
- [ ] App Store Connect에서 새 앱 등록 (Bundle ID: com.ridemap.app)
- [ ] EAS 빌드 성공 → TestFlight 업로드
- [ ] 리뷰어용 테스트 계정 생성 (apple-review@ridemap.app)
- [ ] 스크린샷 캡처 완료 (6.9" 필수, 6.5" 권장)
- [ ] 개인정보 처리방침 `https://motomap.kr/privacy` 공개 접근·최종 내용 확인
- [ ] 위 메타데이터 전부 ASC에 복붙
- [ ] App Privacy 설문 답변
- [ ] Age Rating 설문 답변
- [ ] Submit for Review

---

## 자주 묻는 심사 리젝 사유 대비

1. **Privacy Policy 누락/불일치** — `https://motomap.kr/privacy`와 앱의 실제 처리 항목 대조
2. **Demo Account 미제공** — 위 Sign-In Information 필수 입력
3. **앱 설명과 실제 기능 불일치** — Description 작성 후 한 번 더 검수
4. **위치 권한 사용 목적 불명확** — Info.plist의 `NSLocationWhenInUseUsageDescription` 한국어 명확히 (이미 설정됨)
5. **사용자 생성 콘텐츠 모더레이션 부재** — 신고/차단/삭제 흐름 노트에 명시 (위에 작성됨)
6. **빈 카테고리/리스트** — 출시 시점에 최소 코스/장소 데이터 시드 필수


### 2026-10-21 시작 음성·목적지 복귀 43번 TestFlight 업로드

사용자 승인으로 `96ebee364a95833f0d464e422e06fdef1088bb00`을 main에 푸시하고,
격리된 해당 소스에서 production **1.2.9 (43) / native 6 / API 1** 빌드를 완료했다.
EAS build ID는 `d846a4cb-2c5e-44ae-8e29-01f7ad66fbdb`이며 `FINISHED`와 소스 일치를
확인했다. IPA의 앱 버전·빌드 번호·runtime 1.2.9·production 채널, 복귀 처리 클래스와
selector, 시작 MP3의 원본 SHA-256 일치까지 확인했다.

시작 문구는 **“길안내를 시작합니다. 안전한 라이딩 되세요!”**다. 도착 후 목적지 유지와
안전운행 UI 중계 차단·목적지를 지나친 뒤 새 복귀 경로 요청을 포함한다(NAV-013/014).
타입·릴리스 검사, 287개 테스트와 iOS session/audio 검사는 통과했다. 실제 SDK의 도착·
복귀 경로 성공, 위치/오프라인/종료 경합과 음성 청취는 새 빌드에서 확인해야 한다.

EAS submission `c92bec99-c418-4564-bdf6-84f48447573a`의 **Apple App Store Connect 업로드
성공**을 확인했다. 확인 시점에는 Apple 처리 단계이며 TestFlight 표시·설치 완료를 의미하지
않는다. 심사 재제출·공개 출시·OTA·원격 버전 정책 변경은 하지 않았다. candidate 1.2.9는
유지하며 39~42에 이 네이티브 변경이 전달되지 않는다. 앞선 native 6 로컬 후보의 미푸시·
미빌드·미업로드 상태는 이 후속으로 대체한다.


### 2026-10-21 안전운행 화면 차단·주유소 선택 44번 업로드

사용자 승인으로 `609fd8a`(NAV-015)와 `5386181`(MAP-046)을 main에 푸시하고,
격리된 source `5386181aae2bfe8e6688b9323b42afc09b6730aa`에서 production
**1.2.9 (44) / native 7 / API 1** 빌드를 완료했다. EAS build
`1f1255d6-4bc6-42b3-a2a1-8d93a4d85c17`의 `FINISHED`·소스 일치를 확인했다.
IPA의 앱 버전·44번·runtime 1.2.9·production 채널, 안전운행 차단 클래스/selector와
도착 복귀 클래스, 시작 MP3 원본 일치, 선택 마커의 JS 속성·강조색 포함을 확인했다.

실제 SDK Safety 모드 렌더 입구를 차단하고, 사후 Safety 상태는 SDK 화면 전체를 숨긴다.
유효 경로가 없으면 목적지를 유지해 재안내·종료 수단을 제공한다. 주유소 마커는 선택한
하나를 크게·노란 테두리로 표시하고 현재 줌을 유지해 지도 중앙으로 이동한다.
타입·릴리스 검사·287개 테스트·실제 SDK 모드 경계 fixture·iOS 오디오 검사와 리뷰를
통과했다. 전체 SDK 초기화/실제 주행/도착 복귀 성공·주유소 비트맵/카메라 실기기 확인은
남아 있다. 43번에는 이번 차단 경계와 주유소 선택 강조가 없다.

EAS submission `bdd63877-33c6-4d43-9151-9b84fb369221`의 **Apple App Store Connect
업로드 성공**을 확인했다. 확인 시점은 Apple 처리 단계이며 TestFlight 표시·설치 완료를
의미하지 않는다. 심사 재제출·공개 출시·OTA·원격 버전 정책 변경은 하지 않았다.
candidate 1.2.9는 유지한다. 앞선 native 7 후보의 미푸시·미빌드·미업로드 상태는 이
후속으로 대체하며 실제 기기 확인은 44번에서 진행한다.

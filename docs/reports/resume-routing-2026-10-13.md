# 2026-10-13 재개 알림 연결·홈페이지 복구

## 승인·진행 상태

사용자는 전체 재개 푸시, 알림 탭 자동 App Store 연결, 홈페이지 중단 해제와 검증 후 main
푸시·웹 배포·연결용 OTA를 승인했다. 구현·검증·main 푸시·웹 배포·13 runtime OTA를 완료했다.
본인 기기 테스트 푸시 1건은 Expo/APNs에서 접수했으나 실제 탭은 로딩→지도 진입으로
스토어 연결에 실패했다. 재시작 경계 보완 후 재검증하며 전체 방송은 **미실행**이다.
새 네이티브 빌드·자동 작업·EU 거래자 자격·DB 스키마 변경은 승인 범위가 아니다.

## 구현

- 루트 전용 재개 알림 연결: 로그인/지도 모듈과 분리, 고정 App Store URL, cold/warm tap,
  request ID 중복 방지, 일반 알림 기존 라우팅 유지.
- 홈페이지: 마지막 정상 `1e45a69` 시네마틱 HTML 복원. 기존 CSS/JS·고화질 배경·
  `screens/navigation-1.2.7.png` 등 현재 자산은 교체하지 않았다.
- 공유 Worker: 기존 앱 우선/1.4초 Store 폴백 복원. 최신 고지·AASA·active 상태 보존.
- 공개된 1.2.8의 `unreleasedCandidateVersion`을 null로 변경. bridge2/API1은 유지.

## 구버전 안전 연결 OTA 기준

`prepare-resume-bridge.mjs`는 지정된 과거 package/lock으로 임시 export 폴더를 만든다.
소스 entry만 연결 화면으로 교체하며 운영 앱의 의존성·네이티브 설정을 바꾸지 않는다.
설치에서 postinstall/네이티브 patch를 실행하지 않으며 해당 모듈을 entry에 import하지 않는다.
runtime은 아래 그룹의 allowlist 외에는 거부한다. 이는 새 네이티브 앱 빌드가 아니다.

| 그룹 | runtime | 완료된 production source 기준 | Expo | 알림 모듈 |
| --- | --- | --- | --- | --- |
| legacy | 1.1.0, 1.1.1 | 20cc6b2 | 54.0.33 | 없음 |
| notify54 | 1.1.2, 1.1.3, 1.2.0, 1.2.1 | 635aac6 | 54.0.33 | 0.32.17 |
| patch36 | 1.2.2~1.2.6 | e556828 | 54.0.36 | 0.32.17 |
| patch37 | 1.2.7 | 07db220 | 54.0.37 | 0.32.17 |

모든 그룹은 React19.1.0/RN0.81.5/AsyncStorage2.2.0이다. EAS 실제 production 채널의
브랜치는 production이며 위 12 runtime을 확인했다. 1.1.0 build6~8은 runtime/channel 없음으로
OTA 불가, build9·12는 OTA 가능하다. 1.1.1부터 1.2.7 완료 바이너리는 SDK54/runtime/채널을
확인했다. 최신 1.2.8(38)은 SDK57/production/source71489df이다.

OTA를 못 받는 초기 바이너리·아직 옛 번들을 실행하는 장기 미접속 앱의 첫 알림 탭에는 자동
이동을 보장하지 않는다. 알림 본문에서 App Store 업데이트를 직접 안내한다. 버전과 SDK가
다른 기존 설치본을 현재 1.2.8 실기기 테스트만으로 검증 완료라고 표시하지 않는다.

## 방송 사전 확인

- 원격 profiles165, push_tokens6(모두 iOS). 전체 이용자 165명에게 푸시가 간다는 뜻은 아니다.
- 제안 campaign: `motomap-service-resumed-2026-10-13-1.2.8`, 기존 notices0건.
- `broadcast_notice`는 알림 내역과 최대100 토큰 단위 Expo 요청을 만들지만 자체 campaign
  중복 방지·request ID·receipt 관리가 없다. 이번 발송은 한 번만 실행하고 실제 응답을 확인한다.
- 기기 수신/열람을 ticket/receipt와 혼동하지 않는다. 토큰·비밀키는 로그/문서에 남기지 않는다.

## 실제 실행 결과

- 소스: `2ed016a` 홈페이지·공유 복구, `d1f4834` 알림 연결·SDK54 연결 도구. main/origin에 반영했다.
- 타입·앱191/191·웹5/5·고지 ready·OTA 정책·diff·웹 빌드/dry-run 통과. reviewer의 HTML/SPA
  우회와 지연된 콜드 응답 경합 지적을 수정하고 재검증했다.
- SDK54 네 그룹과 각 runtime iOS Hermes export 통과. source map에서 auth/GPS/map/analytics
  서비스 import 미포함을 확인했다. 초기 두 runtime에는 notifications import도 없다.
- 1.2.8 SDK57 iOS export 통과. 새 native 빌드·과거 바이너리 설치/삭제는 하지 않았다.
- Worker `ac0aed48-81ef-4567-9ed5-a9a3aa3a8674` (`--keep-vars`): 실제 홈200/시네마틱 배경
  브라우저 확인, 공유 장소·라이딩200, 약관3·status·AASA·최신 길안내 PNG200. 홈페이지의
  전체 단계/모바일 상호작용을 이번에 새로 전부 검증했다고 표시하지 않는다.

production/iOS 발행 후 EAS update 목록에서 13 runtime·group·메시지를 재조회했다.

| runtime | update group ID |
| --- | --- |
| 1.1.0 | f9b8a5a9-64cd-40b2-be9d-35ff40e50804 |
| 1.1.1 | ce7240ab-f1a7-4000-b310-aee9b53c9b28 |
| 1.1.2 | bc327253-d0d5-426a-b3f7-bfe2fb7b1f0e |
| 1.1.3 | 8ac0a1da-7607-4bc3-9b60-9a7b44b118dc |
| 1.2.0 | 3b7ba344-b25a-4dee-ac6b-f962a3308b2d |
| 1.2.1 | c2a4f11d-7d53-4d7d-8092-5c35534df228 |
| 1.2.2 | 89041590-d0a7-4d77-b462-f3f6474456ca |
| 1.2.3 | f839b25e-5188-4fff-a6be-60f933cab2d2 |
| 1.2.4 | 64cf94a7-f3d1-473f-8440-7375261e4bb4 |
| 1.2.5 | c014055d-70d0-4b5f-85a6-cc55a83922f7 |
| 1.2.6 | a61d0b10-a483-455d-b977-1cf9f156cdb5 |
| 1.2.7 | 75a19ecf-d6de-4ba9-877c-4754eaebe8e8 |
| 1.2.8 | 5307f595-a185-4a78-82b2-b470ed73337f |

### 테스트 푸시·방송 경계

- 본인 계정 token1에 테스트 알림 1건 전송. pg_net request3, HTTP200/timeoutfalse/
  transport error없음, Expo ticket `01a132b2-0157-732b-9f61-184859bc9dfe` statusok.
  receipt 조회 request4도 HTTP200/statusok로 APNs 접수를 확인했다. 기기 표시·사용자 열람·
  실제 App Store 이동의 증명은 아니다. 운영자가 로딩→지도 진입을 확인해 연결 실패로 기록한다.
- `scripts/broadcast-service-resumed-2026-10-13.sql`: 캠페인 advisory lock·기존 캠페인 거부,
  기존 broadcast RPC, queue request IDs 보존·배치 수 검증 후 commit. 새 schema/RPC/권한
  변경 없음. notifications 사용자 트리거0으로, 공지 INSERT에서 트리거가 추가 푸시를
  보내는 경로는 없음을 확인했다. 시스템 전체의 중복 발송 가능성 부재를 뜻하지 않는다.
- SQL을 ROLLBACK으로 2회 테스트하여 캠페인 notices0/실제 전송0을 유지했다. sequence의
  번호 소비는 롤백 대상이 아니며 테스트 푸시 request3과 구분한다.
- 캠페인 공지가 보존되고 같은 잠금 절차로 실행할 때 멱등성이 유지된다. 공지 전체를 지우고
  같은 방송을 재실행하지 않는다. statement_timeout은 문장별 제한이며 요청 수 일치는 수신
  성공 증거가 아니다. 실제 응답을 별도 조회한다.
- 전체 방송은 아직 실행하지 않았다. 사용자 탭 확인 전 실행하거나 확인자료를 실제 수신으로
  표시하지 않는다. 기존 리뷰·즐겨찾기·방문·동의는 변경하지 않았다.

### 첫 테스트 실패 후 수정

- SDK57.0.27/notifications57.0.22/RN0.86.3은 build38 의존성과 일치한다. native iOS 소스상
  마지막 응답은 모듈 인스턴스에 있어 이미 처리한 응답이 OTA reload 후 보존되지 않을 수 있다.
  test1 실제 원본 응답은 관측하지 못했으므로 실패 원인을 확정하지 않는다.
- 원본 push body/data 엄격 판별, 실제 active 대기, 로컬 ID·만료 시각만 10분 유효하게 보존,
  시작/다운로드 후 reload 경계에서 판정한다. 조회 대기 1.5초 상한과 최신 알림 취소를 추가했다.
  완료한 ID 재조회·만료 연장·일반 실행 정지·오래된 재개 알림 재생을 회귀 테스트한다.
- 루트 TSX 실행 테스트와 SDK54 독립 export는 검증 범위를 넓히지만 실제 iOS 알림 탭
  검증을 대신하지 않는다. 새 OTA 적용과 본인 재테스트 결과는 후속 실행에 기록한다.
- 수정본 앱210/210·타입·OTA 정책·diff 검사 통과. 기존 웹5/5·고지 ready는 이번에 웹/고지
  구현을 바꾸지 않아 유지했다. 단위/루트 테스트 결과를 실기기 알림 이동 성공으로 표시하지 않는다.

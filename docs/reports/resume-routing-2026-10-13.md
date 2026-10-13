# 2026-10-13 재개 알림 연결·홈페이지 복구

## 승인·진행 상태

사용자는 전체 재개 푸시, 알림 탭 자동 App Store 연결, 홈페이지 중단 해제와 검증 후 main
푸시·웹 배포·연결용 OTA를 승인했다. 구현·정적 검증 중이며 이 문서 작성 시점의 원격 반영·
OTA·테스트 푸시·전체 방송은 **미실행**이다. 실행 뒤 산출물과 실제 결과를 아래 추가한다.
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

미실행. 검증 결과·커밋·웹 deployment ID·runtime별 OTA ID·테스트 연결·방송 결과를 후속 기록한다.

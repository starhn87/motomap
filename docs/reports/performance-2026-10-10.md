# 1.2.8 로컬 설치·프로파일 연결 예비 기록

이 문서는 **성능 개선 결과나 공개 출시 검증 완료 보고서가 아니다**.
운영 중단 화면에서 도구 연결을 확인한 단일 예비 표본이다. 지도·길안내·센서·계정 복원은 실행하지 않았다.

## 환경과 검증 범위

- 앱 소스: `26cc80e` + `675b7ca`의 scene 설정. Expo 57.0.27 / RN 0.86.3.
- 로컬 앱·build·runtime: **1.2.8 / 1 / 1.2.8**. Xcode Release + Apple Development 서명.
  EAS 빌드 번호·TestFlight 제출본이 아니다. Sentry 자동 업로드·Expo CLI telemetry는 비활성이다.
- 기기: iPhone 16 / iOS 27.0.1. 유선 연결. 충전·밝기·열 상태·캐시는 통제하지 않았다.
- 도구: macOS 27.0 / Xcode·Instruments 27.0(27A266a), iOS SDK 27.0, Node 22.23.0.
- 사용자 확인 후 개발자 계약 차단이 해소됐고 승인된 모토맵 개발용 서명 갱신·Release 빌드가 통과했다.
- bundle ID·team·Apple 로그인·Associated Domains·`get-task-allow`·version·runtime을 검사했다.
  서명 무결성 검사도 통과했다. 인증서·프로필 원본·기기 식별자는 저장소에 넣지 않는다.
- 설치 전 1.2.7 build 35를 확인했다. 앱을 삭제·초기화하지 않고 1.2.8을 덮어 설치했다.
  설치·실행 성공과 사용자 확인으로 중단 안내의 정상 표시를 확인했다. 실제 기존 계정 데이터 복원은 미검증이다.
- `motomap.kr/service-status`는 계속 `suspended`다. DB·공급자·공개 상태 복구, Git 푸시,
  EAS/TestFlight/OTA/웹 배포와 운영 재개 알림은 하지 않았다.

## S01 부분 시나리오 — CPU 예비 기록

모토맵만 대상으로 Time Profiler의 `--launch` 기록 1회를 완료했다.
목표 20초, trace 전체 시간 21.264초이며 시작·종료 준비 구간을 포함한다.
실기기 모토맵 프로세스인지 trace metadata를 대조하고 XML의 참조 ID를 해석해 집계했다.

| 관측 지표 | 단일 예비 기록 | 해석 |
|---|---:|---|
| 실행 샘플 | 779개 | 1ms sampling의 Running thread 기록 |
| Running sample weight 합 | 779ms | 실제 CPU 누적 시간·CPU 사용률과 동일하게 취급하지 않는다 |
| 메인 스레드 sample weight | 369ms | 다른 스레드 410ms. 벽시계 대기와 별개 |
| trace의 0~5초 sample weight | 552ms | 앱 시작 준비 포함. 화면 표시 시간을 뜻하지 않는다 |
| potential-hangs(>250ms) | 0개 | 이 짧은 중단 화면 표본에서 미관측. 길안내 hang 해결 증거가 아니다 |

이전 버전·최적화 전 대조 표본이 없고 5회 예비 실행·반복 블록도 완료하지 않았다.
따라서 P50/P90, CPU % 및 **업그레이드·위치 구독 수정의 개선율은 산출하지 않는다**.

## 메모리·도구의 미완료 항목

- Time Profiler의 process-name/PID attach는 실행 앱을 찾지 못했지만 bundle ID launch로 기록·저장·export는 통과했다.
- Allocations + VM Tracker의 20초 launch 기록은 저장됐으나 `Timeline modification failed — dylibs overlap`
  진단이 발생했다. 이 진단을 앱의 메모리 누수나 크래시로 분류하지 않는다.
- 해당 export TOC에서 allocation/footprint 수치 테이블을 확보하지 못했고 GUI 접근도 시간 초과였다.
  메모리 기록의 유효성을 확정하지 않았으므로 **heap·footprint·peak 수치는 미측정**으로 둔다.
- raw trace와 원본 XML은 저장소 밖 비공개 로컬에 보관한다. 공유하거나 공개 저장소에 업로드하지 않는다.
- 프로파일러가 종료된 뒤 앱을 일반 실행 방식으로 다시 열었다. 앱 삭제·데이터 초기화는 하지 않았다.

## 다음 단계

1. 공개 중단을 유지한 내부 검증 환경의 DB·네이버·카카오 복구 및 내부 진입 범위를 별도로 승인받는다.
   현재 로컬 빌드는 공개 `preparing`에서 내부 채널로 자동 인정되지 않으며 게이트를 우회하지 않는다.
2. memory 도구 오류를 재검증해 유효한 footprint/heap 경로를 확보한다. 수집 오류가 있는 trace를 기준값으로 쓰지 않는다.
3. [성능 계획](../performance-optimization-plan.md)에 따라 5회 예비 실행, 고정 조건의 반복 측정과
   동일 SDK 최적화 전/후 비교를 진행한다. 지도·길안내·사진·긴 세션의 회귀도 함께 확인한다.
4. 중단 화면의 예비 값과 활성 앱의 측정값을 합치거나 성능 개선율로 바꾸지 않는다.

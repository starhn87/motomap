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

## 후속 — 내부 채널 활성 지도 예비 기록

승인된 [정비 창 복구](internal-restoration-2026-10-10.md) 후 내부 채널 Release를 설치했다.
사용자가 지도·마커와 장소 검색 → 상세 → 경로 미리보기의 정상 동작을 확인했다.
같은 iPhone 16/iOS 27.0.1, Expo 57/RN 0.86.3 조합이다. TestFlight 업로드나 공개 재개는 아니다.

Activity Monitor와 Time Profiler를 동시에 실행하지 않고 각각 20초 launch 기록 **1회씩** 수집했다.
앱 프로세스를 TOC에서 대조했고 XML의 ID 참조를 해석했다. raw 기록은 계속 비공개 로컬에만 둔다.
Activity Monitor에는 앱과 kernel만 대상 프로세스로 기록됐으며 다른 앱의 내용을 분석하지 않았다.

### Activity Monitor — 시작·지도 진입 1회

전체 trace 시간은 21.228초, process-live 표본은 21개다. 시작·종료 준비가 포함된다.
Allocations의 이전 dylib overlap 진단 없이 process-live/ledger export를 완료했다.

| 관측값 | 단일 예비 기록 | 한계 |
|---|---:|---|
| Physical footprint 최고 | 320.25 MiB | 약 2.15초 표본. 전체 native+JS footprint이며 JS heap이 아님 |
| Physical footprint 종료 직전 | 249.35 MiB | 장시간 안정값·누수 없음의 증거가 아님 |
| Real Mem 종료 직전 | 308.44 MiB | footprint와 다른 필드이며 서로 합하지 않음 |
| CPU Time 종료 직전 | 1.849초 | 이 기록의 OS 누적 계수. 다른 Time Profiler 기록의 sampling 합과 구별 |
| CPU 최고 | 63.87% | Instruments % CPU 필드 그대로. 화면 표시 시간·단말 전체 사용률로 바꾸지 않음 |
| 10~20초 구간 CPU | 0.85~3.95%, 시간 가중 평균 1.42% | start가 10초 이상·20초 미만인 유효 구간의 duration 가중치. idle 반복 기준값이 아님 |
| 스레드 최고 | 23개 | 단일 세션 관측 |

### Time Profiler — 별도 시작·지도 진입 1회

전체 trace 시간은 21.212초다. 앱 Running 표본 2,169개·1ms sample weight 합 2,169ms,
메인 스레드 717ms를 관측했다. 0~5초/5~10초/10~15초/15~20초/20초 이후 sample weight는
각각 1,780/165/144/65/15ms다. potential-hangs(>250ms)는 0행이다.

이는 sampling 결과이지 실제 CPU Time·시작 지연·FPS가 아니다. 앞의 Activity Monitor는 별도
실행이며 네트워크·타일 캐시 조건도 달라 두 숫자의 차이를 개선이나 오류로 해석하지 않는다.
길안내의 KNMapLoaderRLM hang 해결을 이 지도 시작 표본으로 확정하지 않는다.

### 남은 측정 경계

- process-name/PID attach는 Activity Monitor에서도 실패했다. launch로 수집하고 종료 후 앱을
  일반 방식으로 재실행했다. profiler 종료로 앱이 종료된 것을 사용자 크래시로 분류하지 않는다.
- 이번에는 실제 physical footprint 경로를 확보했지만 Allocations heap/객체 수명 분석은 여전히 미완료다.
- 충전·화면 밝기·발열·네트워크·SDK 타일 캐시를 통제하지 않았고 5회 예비/반복 블록도 미완료다.
  P50/P90·성능 개선율·누수 해결 완료는 산출하지 않는다.
- 구버전 활성 화면 표본과 동일 SDK 최적화 전 대조가 없다. 중단 화면 779ms 표본은 작업량이
  완전히 다르므로 비교 기준으로 사용하지 않는다. 다음에는 조건 고정 후 지도 gesture·사진·
  긴 세션·길안내를 반복 측정하고 PERF-002의 비교 경계를 유지한다.

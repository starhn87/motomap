# Jev 판단 관찰

## JEV-001 — 공통 전송 라이브러리와 서비스별 판단 경계

- 날짜: 2026-09-27
- 상태: 대체됨(JEV-002), 운영 비활성
- 관련 구현: `supabase/functions/_shared/jevChat.ts`, `jevSubmission.ts`, `vendor/jev-decisions/`

### 배경

여러 저장소의 Jev 전송·응답 검증을 jev-decision-kit의 `@starhn87/jev-decisions`에 모은다.
모토맵의 라이딩 범위와 제보 승인 기준은 이 저장소가 소유한다. 운영 중단 기간에는
OPS-003에 따라 공급자 실호출·키 복구·배포 없이 모의 검증만 한다.

### 결정

- `TYPESAFE_API_KEY`와 `JEV_CHAT_MODE=shadow|enforce`가 함께 있어야 채팅 판단을 호출한다.
  기본은 off이며 모델은 `jev-1.13.0`이다. 최근 6개 메시지, 최대 6,000자, 1초 deadline을 적용한다.
- shadow는 판단만 기록한다. enforce도 검증을 거쳐 별도로 정한
  `JEV_OFF_TOPIC_THRESHOLD`가 없으면 기존 추천을 유지한다. 범위 밖 확률이 기준 이상인
  명백한 무관 질문만 데이터 로드·답변 생성 전에 고정 JSON으로 안내한다.
  모호함·실패는 기존 경로, 요청 취소는 후속 작업 중단이다.
- `JEV_SUBMISSION_MODE=shadow`에서만 기존 심사와 같은 제보·조사·정책으로 각 규칙을
  독립 평가한다. 승인·반려·병합·DB·Discord 동작은 바꾸지 않는다. 대안 가치 경로를
  평균내지 않는다. `EdgeRuntime.waitUntil`이 관찰의 수명을 소유하며 실패도 기존 심사를
  실패시키지 않는다. 제보·조사 원문이나 API 키는 관찰 로그에 넣지 않는다.
- SDK를 포함한 고정 ESM artifact를 vendoring한다. `provenance.json`의 원본 커밋과 파일
  해시를 확인하고, 공통 저장소의 vendor 스크립트로만 갱신한다. 외부 중앙 서버는 없다.

### 검토한 대안과 재검토 조건

Jev가 직접 심사하거나 낮은 확신을 위반으로 해석하는 방식은 기존 정책과 충돌하므로
채택하지 않는다. 모의 테스트는 한국어 의미 정확도의 증거가 아니다. 운영 재개 조건을
충족한 뒤 후속 질문·지역 오탈자·혼합 의도의 오차단과 심사 사례를 사람이 검토하고,
비용·지연·품질을 측정한 후 활성화와 임계값을 별도로 결정한다.

## JEV-002 — 공식 SDK 직접 호출과 공통 응답 유틸리티

- 날짜: 2026-09-27
- 상태: 활성 (운영 비활성)
- 대체 대상: JEV-001의 공통 전송 클라이언트와 SDK 포함 artifact
- 관련 구현: `supabase/functions/_shared/jevChat.ts`, `jevSubmission.ts`, 함수별 `deno.json`

### 배경

추가 판단 인터페이스를 유지할 이점을 확인하지 못해 공식 SDK의 질문·호출 방식을 직접
사용한다. 여러 앱이 공유하는 응답 검사와 관측 형식만 공통 유틸리티로 유지한다.

### 결정

- 공식 `@typesafe-ai/sdk@0.6.0`의 `TypeSafeClient.systemOne()`으로 호출한다. 실행 옵션과
  취소·입력 제한을 이 저장소에서 지정한다. 기존 질문·모델·Shadow/enforce 조건·임계값·
  실패 시 추천 유지·심사 비간섭·원문 없는 관측과 백그라운드 수명은 JEV-001대로 유지한다.
- `@starhn87/jev-decisions@0.2.0`은 SDK를 포함하지 않는다. `toObservation`으로 이미 받은
  SDK 응답과 오류를 검증된 답변·실패 종류·관측 메타데이터로 변환한다. 공통 유틸리티는
  API 호출이나 저장을 수행하지 않는다. SDK의 타입을 사용하고 별도 질문 문법을 만들지 않는다.
- 유틸리티 artifact의 소스 커밋과 파일 해시는 `provenance.json`으로 확인한다. 이전 선언과
  SDK 복사본은 제거한다. SDK 버전은 Deno import map과 lockfile로 고정하고, 배포 진입점인
  `moto-chat-v2`·`judge-submission`에도 같은 SDK import map을 둔다.
- OPS-003의 운영 중단 경계는 유지한다. SDK 변경 검증은 모의 요청·타입 검사로 수행한다.

### 영향과 재검토 조건

모의 검증은 의미 정확도나 실제 비용 개선의 증거가 아니다. 같은 검증·관측 규칙의 공유가
유지보수 비용을 줄이는지 확인한다. 새로운 상위 호출 인터페이스는 실제 반복이 확인될 때
검토하며, 공식 SDK가 제공하는 기능은 다시 구현하지 않는다.

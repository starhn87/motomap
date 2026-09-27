# Jev 판단 관찰

## JEV-001 — 공통 전송 라이브러리와 서비스별 판단 경계

- 날짜: 2026-09-27
- 상태: 활성 (운영 비활성)
- 관련 구현: `supabase/functions/_shared/jevChat.ts`, `jevSubmission.ts`, `vendor/jev-decisions/`

### 배경

여러 저장소의 Jev 전송·응답 검증을 agent-model-router의 `@starhn87/jev-decisions`에 모은다.
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

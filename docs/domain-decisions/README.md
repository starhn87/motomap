# 도메인 의사결정 기록

기능의 현재 모습보다 **왜 그렇게 동작하는지**, 어떤 대안을 시도했고 왜 버렸는지,
다시 바꿀 때 무엇을 지켜야 하는지를 도메인별로 보존한다. `ARCHITECTURE.md`가 현재
구조를 설명한다면 이 디렉터리는 결정의 맥락과 시행착오를 설명한다.

## 작업 전 필수 절차

기능을 수정·추가·삭제하기 전에 다음 순서를 지킨다.

1. 아래 색인에서 관련 도메인을 찾고 해당 문서를 **코드 탐색보다 먼저** 읽는다.
2. `활성 원칙`, 이전 결정의 근거, 실패한 접근, 재검토 조건을 확인한다.
3. 제안한 변경이 기존 결정과 충돌하면 조용히 덮어쓰지 말고 충돌과 선택지를 먼저 드러낸다.
4. 의미 있는 결정이 추가·변경되거나 새로운 시행착오가 생기면 코드와 같은 논리 단위의
   커밋에서 해당 문서를 갱신한다.
5. 기존 기록은 삭제하지 않는다. 결정이 바뀌면 이전 항목을 `대체됨`으로 표시하고 새
   결정의 ID를 연결한다.

관련 문서가 아직 없다면 이 색인을 확인한 사실을 전제로 새 도메인 문서를 만든다. 한
작업이 여러 도메인에 걸치면 관련 문서를 모두 검토한다.

## 도메인 색인

| 도메인 | 기록 | 주요 구현 영역 |
|---|---|---|
| 지도·장소 상세·지도 날씨 | [map-place-details.md](map-place-details.md) | `components/map/`, `stores/useMapStore.ts` |
| 공통 아이콘·터치 피드백 | [interaction-feedback.md](interaction-feedback.md) | `app/`, `components/`의 터치 액션 |
| 공유 URL·유니버설 링크 | [share-links.md](share-links.md) | `website/src/index.js`, `website/public/share.js`, `app/place/[id].tsx`, `app/course/[id].tsx` |
| 통합 검색·검색 결과 지도 | [search.md](search.md) | `app/search.tsx`, `app/search-results.tsx`, `lib/api/search.ts` |
| 앱 내 길안내 | [navigation.md](navigation.md) | `app/navi.tsx`, `modules/kakao-navi/` |
| 노면 위험 정보 수명주기 | [hazard-lifecycle.md](hazard-lifecycle.md) | `road_hazards`, `hazard_votes`, `components/map/HazardSheet.tsx` |
| 인증·세션 저장 | [authentication.md](authentication.md) | `lib/authStorage.ts`, `lib/supabase.ts`, `stores/useAuthStore.ts` |
| 장소 선별·운영 상태 검증 | [place-curation.md](place-curation.md) | `public.places`, `scripts/seed-place-curation.mjs`, 장소 검증 마이그레이션 |
| 일반 장소 추천 | [community-place-recommendations.md](community-place-recommendations.md) | `public.general_place_shares`, 일반 장소 상세·지도 |
| 장소·코스 제보 심사 | [submission-moderation.md](submission-moderation.md) | `docs/submission-approval-policy.md`, `supabase/functions/judge-submission/` |
| 릴리스·버전 호환성 | [release-compatibility.md](release-compatibility.md) | `config/release-policy.json`, `lib/appCompatibility.ts`, `modules/kakao-navi/`, `.github/workflows/checks.yml` |

새 도메인 문서를 추가할 때 이 표에도 반드시 연결한다.

## 기록할 내용

- 사용자에게 보이는 핵심 동작과 화면 간 일관성
- 데이터의 기준 소스, 수명주기, 호환성, 개인정보 경계
- 외부 SDK·API의 제약과 검증된 우회 방법
- 실제로 시도했지만 실패했거나 회귀를 만든 접근
- 선택한 대안과 버린 대안의 트레이드오프
- 결정의 재검토 조건과 관련 코드·마이그레이션·커밋

단순 작업 일지나 모든 픽셀 변경을 쌓지는 않는다. 다만 사소해 보이는 변경이라도 여러
화면이 따라야 할 규칙이나 재발하기 쉬운 제약을 만들면 기록한다. 비밀키·토큰·개인정보는
절대 기록하지 않는다.

## 항목 형식

```md
## DOM-001 — 결정 제목

- 날짜: YYYY-MM-DD
- 상태: 활성 | 대체됨(DOM-002) | 보류
- 관련 구현: `path/to/file`, 커밋 `abcdef0`

### 배경
어떤 문제와 제약 때문에 결정이 필요했는지.

### 결정
현재 지켜야 할 동작과 경계.

### 검토한 대안과 시행착오
시도하거나 검토한 접근, 관찰 결과, 채택하지 않은 이유.

### 영향과 재검토 조건
후속 작업이 지켜야 할 조건과 언제 다시 판단할지.
```

# 이벤트 계측 설계

제품 분석은 **PostHog**, 설치 전 유입은 **App Store Connect App Analytics**, 크래시·성능은 **Sentry**가 맡는다.
세 도구의 질문이 겹치지 않게 나눈다 — 어떻게 왔나(ASC) / 무엇을 했나(PostHog) / 왜 실패했나(Sentry).

iOS는 ATT 이후 개별 사용자 어트리뷰션이 불가능하다. 앱 스토어 유입 경로는 어떤 SDK로도 알 수 없으니
ASC 를 보고, 자체 채널(디스코드 등)만 딥링크 파라미터로 직접 구분한다.

## 측정하는 퍼널

**A. 발견 → 안내** — 앱의 존재 이유
```
app_opened → place_viewed → navigation_started → navigation_ended(arrived)
```
`place_viewed.source` 로 어느 발견 경로(검색·마커·즐겨찾기·AI챗)가 실제 주행까지 이어지는지 가른다.

**B. 검색**
```
search_submitted → (search_no_results) → search_result_selected
```
`search_no_results` 는 **등록 장소가 0건일 때** 나간다. 카카오 일반 장소까지 0건일 때만 세면
거의 안 찍힌다 — 카카오는 웬만한 문자열에 뭐라도 돌려주기 때문이다. `kakao_count` 로 가른다:
0 이면 검색어 자체가 안 걸린 것(오타), 1 이상이면 **실재하는데 우리 DB 에 없는 곳** = 제보 우선순위.

**C. 기여**
```
place_submitted → 승인
```

**D. 내 바이크 정체성**
```
bike_setup_viewed → bike_setup_saved → bike_ride_history_opened
```
모델명은 보내지 않는다. 등록 전환과 정규 기종 매칭 여부, 넓은 바이크 유형만 본다.

## 이벤트

### 발견

| 이벤트 | 속성 |
| --- | --- |
| `search_submitted` | `method`(typed·voice) · `source`(map_bar·search_screen·point_modal) · `query` |
| `search_no_results` | `query` · `source` · `kakao_count` |
| `search_result_selected` | `result_type`(registered·kakao·course) · `rank` · `source` |
| `search_filter_toggled` | `filter`(open·parking·rating) · `on` |
| `search_scope_changed` | `scope`(near·all) |
| `search_area_refreshed` | - |
| `category_filtered` | `category` |
| `place_viewed` | `place_id` · `category` · `source` |

`place_viewed.source`: `map_marker` · `search` · `search_results` · `favorite` · `chat` · `notification` · `course` · `submission`

### 안내

| 이벤트 | 속성 |
| --- | --- |
| `navigation_previewed` | `distance_m` · `duration_s` · `priority` · `via_count` · `has_custom_start` |
| `navigation_started` | `mode`(live·preview) · `priority` · `via_count` · `distance_m` |
| `navigation_ended` | `reason`(arrived·cancelled) |
| `route_failed` | `code`(KNSDK 에러 코드) · `via_count` |

### 참여·기여

| 이벤트 | 속성 |
| --- | --- |
| `favorite_toggled` | `on` · `place_id` · `category` · `source` |
| `place_submitted` | `category` |
| `review_submitted` | `target`(place·course) · `rating` · `has_photo` |
| `chat_message_sent` | `turn_index` |

### 내 바이크

| 이벤트 | 속성 |
| --- | --- |
| `bike_setup_viewed` | `has_bike` |
| `bike_setup_saved` | `action`(registered·updated·removed·unchanged) · `canonical` · `category` |
| `bike_ride_history_opened` | `source`(bike_setup·profile·bike_hero) |
| `bike_passport_shared` | `scope`(all·bike) · `places` · `rides` |
| `bike_garage_changed` | `action`(added·edited·activated·removed) · `bike_count` |

### 획득

| 이벤트 | 속성 |
| --- | --- |
| `app_opened_from_link` | `campaign` · `source` |

### 화면 조회

expo-router 는 `NavigationContainer` 를 노출하지 않아 PostHog 의 화면 자동 수집(`captureScreens`)이
동작하지 않는다(SDK 타입 주석에 명시). `useScreenTracking()` 이 `usePathname()` 을 구독해 직접 보낸다.
동적 세그먼트는 값이 아니라 패턴으로 보낸다 — `/course/[id]` 지 `/course/abc-123` 이 아니다.

## 넣지 않는 것

- **버튼 클릭 전수** — 퍼널에 안 걸리는 클릭은 노이즈다. 필요해질 때 추가한다.
- **크래시·성능** — Sentry 담당. 중복하면 양쪽 신뢰도가 떨어진다.

## 절대 보내지 않는 것

- **집·회사의 좌표와 이름** — 민감 장소는 라벨만 노출하는 앱 원칙을 계측에도 적용한다.
  내 장소 설정 플로우에서 나는 `search_submitted` 는 `query` 를 뺀다.
- **현재 위치 원좌표** — 라이더 동선이 그대로 남는다.
- **리뷰 본문·채팅 내용·이메일·닉네임**
- **바이크 모델명** — 정규 목록 여부와 넓은 유형만 보낸다.

`query` 는 보낸다. "무엇을 찾다 실패했는지"를 알아야 검색을 고칠 수 있고 그게 이 계측의 최대 실익이다.
위 예외만 지킨다.

## 세션 리플레이

RN 은 **스크린샷 모드만** 지원한다 — 화면이 통째로 찍히므로 마스킹이 곧 방어선이다.

**전역 설정**(`lib/analytics.ts`) — SDK 기본값도 true 지만 꺼지면 바로 유출이라 명시한다.
`maskAllTextInputs` · `maskAllImages` · `maskAllSandboxedViews`.
콘솔 로그(`captureLog`)는 끈다 — 진단은 Sentry 담당이라 리플레이에 실을 이유가 없다.

**개별 마스킹**(`PostHogMaskView`) — 입력이 아닌 *표시* 텍스트는 위 설정으로 안 가려진다.

- 내 정보 탭의 이름·이메일
- 지점 검색 모달의 결과 목록 — 단, 집·회사를 정하는 중일 때만(`allowSaved === false`).
  길찾기용 검색까지 가리면 리플레이를 볼 이유가 없어진다.

**녹화 일시정지**(`pauseReplay`/`resumeReplay`) — 네이티브 `Alert` 은 RN 뷰 계층 밖이라
마스킹이 닿지 않는다. 집·회사 이름을 띄우는 내 정보 탭의 Alert 이 유일한 대상이다.

## 사용자 식별

Supabase auth 의 user id 로 `identify()`. 비로그인은 익명 id 로 쌓다가 로그인 시 이어 붙인다(`alias`) —
그래야 "가입 전 탐색 → 가입" 전환이 끊기지 않는다. 로그아웃 시 `reset()`.

## 설정

`EXPO_PUBLIC_POSTHOG_API_KEY` 가 없으면 계측 전체가 무효화된다(개발 중이거나 키 미설정 시 안전).
개발 빌드(`__DEV__`)에서도 보내지 않는다 — Sentry 와 같은 이유로, 개발 노이즈가 실데이터를 오염시킨다.

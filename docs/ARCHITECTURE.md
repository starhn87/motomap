# 모토맵 아키텍처

오토바이 라이더용 지도 앱의 **코드 레벨 구조 문서**. 화면·상태·데이터·백엔드가 어떻게 맞물리는지를 한 곳에서 항해할 수 있게 정리한다.

> 역할 분담 — 제품 소개·기능·빌드 절차는 [README](../README.md), 개발 명령·배포 절차·hard-won gotchas는 [CLAUDE.md](../CLAUDE.md), 로드맵은 [PLAN.md](../PLAN.md).

---

## 1. 한눈에 보기

```
┌─────────────────────────────────────────────────────────────┐
│                  앱 (Expo / React Native)                     │
│                                                               │
│   app/ (expo-router 화면)  ──  components/ (UI)               │
│        │                                                      │
│   ┌────┴─────────────┬──────────────────────┐                │
│   │ stores/ (zustand)│  hooks/ (react-query) │                │
│   │  전역 UI·세션 상태 │   서버 상태·캐싱        │                │
│   └──────────────────┴──────────┬───────────┘                │
│                                  │                            │
│                          lib/api/ (API 래퍼)                  │
└──────────────────────────────────┬──────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐         ┌────────────────────┐      ┌──────────────────┐
│   Supabase   │         │    네이버 클라우드    │      │   기타 외부       │
│ Postgres+    │         │ 지도 SDK · Directions│      │ KNSDK 길안내      │
│ PostGIS·Auth │         │ · Geocoding          │      │ Sentry            │
│ ·Storage·RLS │         └────────────────────┘      └──────────────────┘
└──────────────┘
```

핵심 결정:
- **상태는 두 갈래** — 전역 UI·세션 상태는 zustand(`stores/`), 서버에서 온 데이터는 react-query(`hooks/`)가 캐싱한다. 둘을 섞지 않는다.
- **백엔드는 Supabase 단일** — 인증·DB·스토리지를 한곳에서. 공간 질의는 PostGIS RPC로 위임.
- **지도/지오코딩은 네이버, 경로는 카카오(이륜차) 우선**, 턴바이턴 내비는 앱 안 KNSDK 길안내 화면으로 제공한다.

---

## 2. 레이어 구조 & 데이터 흐름

읽기/쓰기 모두 같은 4-레이어를 지난다:

```
화면(app/) → 컴포넌트(components/) → 훅(hooks/, react-query) → API(lib/api/) → Supabase
                                         └ 전역 상태가 필요하면 stores/(zustand)
```

**읽기 흐름 예시 — 지도에 장소 표시:**

```
app/(tabs)/index.tsx          카메라 중심·카테고리 필터를 useMapStore 에서 읽음
  └ usePlaces(category, center)         hooks/usePlaces.ts
      └ fetchNearbyPlaces({lat,lng,radius,category})   lib/api/places.ts
          └ supabase.rpc('nearby_places', …)   PostGIS 반경 질의
              └ places 테이블 (location: POINT(lng lat))
```

**쓰기 흐름 예시 — 리뷰 작성:**

```
ReviewForm → useCreateReview() → createReview() → INSERT reviews
  └ onSuccess: invalidateQueries(['reviews', placeId])
              → 500ms 후 ['places'], ['place', placeId] 도 무효화 (평점/리뷰수 갱신 반영)
```

**캐시 무효화 패턴** — 리뷰·코스리뷰 mutation은 1차로 해당 목록 키를 즉시 무효화하고, **약 500ms 뒤** 연관된 집계 키(`['places']`, `['courses']`, 상세 키)를 다시 무효화한다. 서버 트리거가 `rating`/`review_count` 집계를 갱신하는 시간을 벌기 위함이다. (`hooks/useReviews.ts`, `hooks/useCourseReviews.ts`)

---

## 3. 디렉토리 맵

```
app/                    expo-router 파일 기반 라우팅 (화면)
  _layout.tsx           루트: providers·초기화·Stack 정의
  (tabs)/               하단 탭 4개 (지도·탐색·제보·내 정보)
  course/[id].tsx       코스 상세 + 리뷰
  legal/[type].tsx      약관·정책 뷰어
  settings·favorites·my-reviews·my-submissions·blocked-users·edit-nickname
components/             재사용 UI — map · review · submit · auth · search · report · explore · ui
hooks/                  react-query 훅 (서버 상태)
stores/                 zustand 스토어 (전역 상태)
lib/                    Supabase 클라이언트 · API 래퍼(api/) · 도메인 유틸
constants/             색·카테고리·포맷터·법무 문서·마커·태그
types/index.ts         도메인 타입 (Place·RidingCourse·Review)
supabase/migrations/   스키마 마이그레이션 (001~004)
scripts/               시드·정리·검증 (Node, .env 직접 로드)
plugins/               expo config 플러그인
.maestro/              E2E·스토어 스크린샷 자동화
```

---

## 4. 화면 & 라우팅

### 루트 레이아웃 (`app/_layout.tsx`)

provider 중첩과 부팅 시 초기화를 담당한다.

```
Sentry.wrap(
  GestureHandlerRootView
    └ QueryClientProvider           react-query
        └ ThemeProvider             다크/라이트 (react-navigation 테마)
            └ Stack                 expo-router 스택
    └ Toast                         (Provider 트리 밖, 최상위 오버레이)
)
```

- **부팅 초기화**(useEffect): `useAuthStore.initialize()` · `useThemeStore.loadMode()` · 푸시 토큰 조용한 갱신(`registerPushToken(false)` — 권한 요청은 제보 직후에만) · Kakao SDK 초기화. 폰트 로드 완료 후 스플래시 해제.
- Sentry는 DSN이 있을 때만 init, 앱 전체를 `Sentry.wrap`.

### 탭 (`app/(tabs)/`)

| 탭 | 라우트 | 화면 | 하는 일 |
|---|---|---|---|
| 지도 | `/` | `index.tsx` | 지도+POI 탐색, 카테고리 필터, 검색, 마커 탭→상세 |
| 탐색 | `/courses` | `courses.tsx` | 추천 코스 목록 ↔ "추천 목적지"(RecommendedPlaces) 토글 |
| 제보 | `/submit` | `submit.tsx` | 장소·코스·건의 3종 제보 폼 |
| 내 정보 | `/profile` | `profile.tsx` | 프로필·메뉴(설정·즐겨찾기·내 리뷰·내 제보·로그아웃) |

### 스택 / 모달 라우트 (루트 `Stack`에 등록)

| 라우트 | 진입점 | 화면 |
|---|---|---|
| `/settings` | 내 정보 | 테마·계정 탈퇴 |
| `/edit-nickname` | 내 정보 | 닉네임 변경(중복 확인·랜덤 생성) |
| `/my-rides` | 내 바이크 기록 카드 | 장소별 라이딩 횟수(도착·경유·마지막 날짜) — 등록 장소는 탭 시 지도 포커스 |
| `/favorites` | 내 정보 | 즐겨찾기 장소 → 탭 시 길안내 |
| `/my-submissions` | 내 정보 | 내 제보 + 승인 상태 |
| `/my-reviews` | 내 정보 | 내가 쓴 리뷰 |
| `/blocked-users` | 내 정보 | 차단 관리(해제) |
| `/legal/[type]` | 설정 | 약관·개인정보·위치 문서 (`type` 동적) |
| `/search-results` | 검색에서 엔터 | 검색 결과 지도 — 등록(카테고리 마커)·일반(중립 핀) 결과를 지도 + 바텀시트 목록으로, 선택 시 기존 포커스 플로우 |
| `/course/[id]` | 코스 목록·검색 | 코스 상세 + 리뷰 + 지도 미리보기 |
| `/navi` | 길안내 버튼(장소·코스·길찾기) | 경로 미리보기 — 옵션(추천·시간·거리·큰길)별 경로 지도 표시 → KNSDK 안내 시작. 코스 안내가 아니면 상단 카드에서 출발지·경유지(최대 3)·도착지 편집·스왑·드래그 재정렬 |
| `/directions` | 지도 탭 검색바 옆 버튼, 장소 상세 [출발] | 길찾기 — 출발지·경유지(최대 3)·도착지 검색(카카오 로컬)·스왑 → 미리보기(경유지 전달) |

### 인증 게이팅

제보·내 정보 탭은 로그인이 필요하다. 비로그인 시 라우트 이동이 아니라 `components/auth/LoginPrompt`를 조건부 렌더한다. 세션은 `useAuthStore`(Supabase Auth)가 들고 있다.

### 화면 구성 하이라이트

- **지도 화면(`(tabs)/index.tsx`)** — `NaverMapView` 위에 오버레이를 쌓는다: 클러스터/마커(`PlaceMarker`), 사용자 위치(`UserLocationMarker`+`LocationPulse`). UI 레이어로 `SearchBar`·`CategoryFilter`·즐겨찾기 별 FAB(날씨 FAB 행 우측)·내 위치 버튼·`PlaceBottomSheet`(선택 장소). 카메라 이동(`onCameraChanged`)을 디바운스해 `usePlaces`를 재조회. 별 토글을 켜면 즐겨찾기 장소가 뷰포트·필터·클러스터와 무관하게 개별 별 마커(`markers/*_fav.png`, 이름 캡션 포함)로 항상 표시된다. 길안내 진입 시 경로 미리보기·옵션 선택은 `/navi` 화면이 맡는다.

---

## 5. 상태 관리

### Zustand 스토어 (`stores/`)

| 스토어 | 상태 | 영속(AsyncStorage) |
|---|---|---|
| `useAuthStore` | `user` · `session` · `loading` | — (Supabase가 세션 관리, Sentry user 동기화) |
| `useMapStore` | `userLocation` · `selectedPlaceId` · `activeFilter` | — (휘발성 지도 UI) |
| `useThemeStore` | `mode` (`system`/`light`/`dark`) | `theme-mode` |

### React Query (`hooks/`)

서버에서 온 모든 데이터는 react-query가 캐싱한다. mutation은 `onSuccess`에서 관련 키를 무효화(§2).

**Query key 컨벤션:**

| 도메인 | 키 |
|---|---|
| 장소(반경/전체) | `['places', lat, lng, radius, category]` · `['places']` · `['places','recommended']` |
| 장소 상세 | `['place', id]` |
| 근처 장소(장소 기준) | `['nearby-of', placeId, radius, limit]` |
| 노면 위험 | `['hazards', lat, lng]` · `['course-hazards', courseId]` |
| 코스 근처 장소 | `['course-places', courseId]` |
| 코스 | `['courses']` · `['courses','detail', id]` |
| 리뷰 / 코스리뷰 | `['reviews', placeId]` · `['course-reviews', courseId]` |
| 즐겨찾기 | `['favorites', userId]` |
| 라이더 장소 정보 | `['place-rider-facts', placeId, userId]` |
| 내 바이크 장소 매칭 | `['bike-place-matches', userId, bikeId, model, category, placeIds]` |
| 차단 | `['blocks','ids', userId]` · `['blocks','users', userId]` |

> `useUserLocation`은 react-query가 아니다 — expo-location으로 권한·현재 위치·방향(heading)을 watch하고 `useMapStore.setUserLocation()`에 흘려보낸다.

---

## 6. 도메인 모델 & DB 스키마

### 타입 (`types/index.ts`)

- **`PlaceCategory`** = `cafe` · `restaurant` · `rest_stop` · `gas_station` · `repair_shop` · `viewpoint` · `gear_shop` · `camping` · `car_wash` (9종, DB `places_category_check`와 일치)
- **`Place`** — 좌표(lat/lng)·주소·전화·영업시간·주차정보·사진[]·태그[]·평점·리뷰수·`submittedBy`·`approved`
- **`RidingCourse`** — 거리(km)·소요(분)·`coordinates [lng,lat][]`·`waypoints: Place[]`·평점
- **`Review`** — `placeId`·`userId`·`userName`·`avatarUrl`·평점·내용·사진[]

> ⚠️ 좌표 순서 주의: 타입과 DB는 GeoJSON 순서 **`[lng, lat]`**, 네이버 지도 API·`Coord`는 **`{latitude, longitude}`**. 변환은 주로 API 래퍼에서 일어난다.

### 테이블 & RPC

| 테이블 | 출처 | 비고 |
|---|---|---|
| `places` | 운영 기준선 | `location` PostGIS `POINT(lng lat)`, `places_category_check` 9종 |
| `courses` | 운영 기준선 | `coordinates` jsonb |
| `reviews` · `course_reviews` | 운영 기준선 | `profiles` 조인(닉네임·아바타) |
| `favorites` | 운영 기준선 | (user_id, place_id) |
| `profiles` | 운영 기준선 | `deleted_at` 소프트 삭제 플래그 |
| `reports` | 운영 기준선 (이력 001) | target_type·reason·status, (reporter,target) 유니크 |
| `blocks` | 운영 기준선 (이력 001) | (blocker, blocked) 유니크 + self-block 방지 |
| `feedback` | 운영 기준선 | type(bug/feature/general) |
| `user_bikes` | `20260815115054` | 여러 바이크와 활성 바이크, `profiles.bike_model` 호환 mirror |
| `place_rides` | 운영 기준선 + 후속 migration | 도착 시점 기종·유형 스냅샷, 원시 행은 본인만 조회 |
| `place_rider_fact_votes` | `20260815120500` | 장소 편의 정보 1인 1표, 원시 행 비공개·집계 RPC만 노출 |

**RPC 함수:**
- `nearby_places(lat, lng, radius_meters, category_filter)` — PostGIS 반경 + 카테고리 질의
- `all_places(category_filter)` — 카테고리 질의(전체)
- `delete_my_account()` (SECURITY DEFINER, 002) — 프로필 익명화 + `deleted_at` 설정
- `get_place_rider_facts(place_id)` — 승인 장소의 라이더 정보별 확인 수와 내 확인 여부
- `toggle_place_rider_fact(place_id, fact_code)` — 로그인 사용자의 장소 정보 1표 토글
- `bike_place_matches_v1(place_ids, bike_category)` — 활성 기종·유형과 맞는 장소를 최소 2명 익명 집계로 반환

> 📌 원격에서 직접 생성됐던 초기 테이블까지 `20260814142438_remote_schema_baseline.sql`에 캡처했다. 새 로컬 환경은 이 파일 하나로 2026-08-14 운영 스키마를 재현하고, 이후 마이그레이션만 순서대로 적용한다.

**RLS** — reports/blocks는 "본인 행만" 정책(select/insert/update/delete가 `auth.uid()` 기준).

### 마이그레이션 요약

활성 기준선은 `supabase/migrations/20260814142438_remote_schema_baseline.sql`이다.
아래 파일은 기준선에 흡수된 과거 변경 이력으로, `supabase/migration_history/`에 보존하며 CLI는 실행하지 않는다.

| 파일 | 내용 |
|---|---|
| `001_reports_blocks.sql` | `reports`·`blocks` 테이블 + RLS |
| `002_account_deletion.sql` | `profiles.deleted_at` + `delete_my_account()` RPC |
| `003_rides.sql` | `rides` 테이블 — **주행 기능 제거로 현재 미사용** |
| `004_add_gear_shop_category.sql` | `places_category_check`에 `gear_shop` 추가 |
| `005_submission_notifications.sql` | 제보·건의 INSERT 시 디스코드 웹훅 알림 (pg_net 트리거, URL은 Vault) |
| `006_push_tokens_approval_push.sql` | `push_tokens` 테이블 + 제보 승인(approved false→true) 시 제보자 Expo 푸시 |
| `007_places_soft_delete.sql` | `places.deleted_at` — 제보 반려는 hard delete 대신 soft delete (승인은 `deleted_at is null`인 행만) |
| `008_course_approval_ai_judge.sql` | 코스 `approved`/`deleted_at`(승인 플로우 도입, 시드 백필) + 코스 알림·승인 푸시 + 제보 AI 판정 EF 호출 트리거 |
| `009_push_copy_and_deeplink.sql` | 승인 푸시 문구 정리(을/를 조사 함수) + `data`(placeId/courseId) — 알림 탭 시 앱이 해당 장소·코스로 이동 |
| `010_duplicate_check_rpc.sql` | 중복 제보 방지 RPC (`place_exists_at_address`/`course_exists_with_name`, definer — RLS 숨김 무관하게 존재 여부만 반환) |
| `011_add_camping_category.sql` | `places_category_check`에 `camping` 추가 (모토캠핑) |
| `012_rpc_exclude_soft_deleted.sql` | `all_places`/`nearby_places`에 `deleted_at IS NULL` 추가 — 승인 후 soft delete 된 행이 지도·검색·AI 챗에 노출되던 버그 수정 |
| `013_profiles_bike_model.sql` | `profiles.bike_model` — 마이 바이크 기종 (자기 신고, 리뷰에 뱃지 노출) |
| `014_notifications.sql` | `notifications` 테이블(RLS 본인만) + 승인 트리거가 푸시 전에 인앱 알림 이력을 기록 (토큰 없어도 기록) |
| `015_rejection_notifications.sql` | `places`/`courses.rejected_reason` + 반려(미승인 `deleted_at` 세팅) 시 사유 포함 인앱 알림·푸시 — 승인 후 운영 정리(soft delete)에는 발동 안 함 |
| `016_ai_reject_reason.sql` | `places`/`courses.ai_reject_reason` — AI 판정이 만든 제보자용 반려 문구. 디스코드 반려 버튼(moderate EF)이 `rejected_reason`으로 복사 |
| `017_rejection_copy.sql` | 반려 알림 문구 재구성 — 제보명은 title 로, body 는 사유 전문만 (상투 접두와 AI 문구 중복 제거) |
| `018_rejection_push_deeplink.sql` | 반려 푸시 data 에 `notificationId` — 탭하면 앱이 알림 목록에서 해당 알림 스크롤·강조 |
| `019_retry_missing_judgements.sql` | 판정 누락 자동 재시도 — EF waitUntil 백그라운드는 인스턴스 셧다운 시 증발할 수 있어, 3분 넘게 판정 문구 없는 pending 제보를 pg_cron 이 5분마다 재판정 (1시간 윈도) |
| `020_lock_retry_rpc.sql` | 019 함수의 RPC 권한 잠금 — anon 이 재판정을 연타하는 비용 공격 차단 (cron 은 postgres 권한이라 무관) |
| `021_feedback_reply.sql` | `feedback.reply`/`reply_at` + 답변 시 건의자 알림·푸시 트리거 + 새 건의를 봇 메시지([답변하기] 버튼)로 발송 (봇 미설정 시 웹훅 폴백) |
| `022_course_sections.sql` | `courses.section_from`/`section_to`/`route_name` — 코스를 "어디에서 어디까지, 무슨 길" 구간으로 표기 |
| `023_course_geometry.sql` | `courses.route_geometry` — 실도로 스냅 후 단순화한 표시용 경로선 (등록 좌표 `coordinates` 는 코스 정의로 유지) |
| `024_places_near_course.sql` | `places_near_course` RPC — 코스 경로선 반경 내 승인 장소를 `ST_LineLocatePoint` 진행도 순으로 (코스 상세 '근처 장소') |
| `025_road_hazards.sql` | `road_hazards`+`hazard_votes`, `live_road_hazards` 뷰, `nearby_hazards`/`hazards_near_course`/`vote_hazard` — 노면 위험 제보. 승인 대기 없이 즉시 공개하고 유형별 수명(`hazard_fresh_days`)으로 신뢰 관리: 수명 초과면 `staleness=1`(흐리게), 2배 초과나 '없어졌어요' 2표면 목록에서 제외(삭제 아님) |
| `026_fix_vote_hazard_ambiguity.sql` | `vote_hazard` 파라미터를 `p_` 접두사로 재생성 — 이름이 `hazard_votes.hazard_id` 와 같아 `ON CONFLICT` 자리에서 ambiguous 로 실패했다 |
| `027_review_likes.sql` | `review_likes` + `reviews.like_count`(트리거 유지) + 좋아요 시 리뷰 작성자에게 알림·푸시 — 본인이 누른 건 제외. "내가 눌렀는지"는 RLS 가 본인 행만 돌려주는 성질로 판별(별도 쿼리 없음) |
| `028_fix_review_like_search_path.sql` | 027 두 함수의 `search_path` 를 `public` 으로 — 빈 값이면 reviews UPDATE 로 이어지는 기존 트리거가 스키마 없는 참조를 못 찾아 42P01 로 실패한다 |
| `029_air_cache.sql` | 에어코리아 응답 DB 캐시 — EF 메모리 캐시는 유휴 시 증발해 사실상 매번 미스였다(원 API 10~26초) |
| `030_feedback_select_own.sql` | 건의 본인 행 select 정책 — 내 제보 목록에서 답변 조회 |
| `031_add_car_wash_category.sql` | `places_category_check`에 `car_wash`(세차) 추가 |
| `032_favorite_general_places.sql` | 등록되지 않은 일반 장소(카카오)도 즐겨찾기 |
| `033_structured_hours.sql` | 영업시간 구조화(`hours` jsonb) — "지금 영업중" 계산용, 원문 텍스트는 유지 |
| `034_google_place_cache.sql` | 구글 Places 응답 캐시 — place_id 무기한·콘텐츠 30일(약관 상한) |
| `035_place_rides.sql` | `place_rides` — 도착지 300m 안에서 끝난 라이딩을 장소별 카운트(도착지·경유지, 로그인 라이더만) |
| `036_place_ride_bikes.sql` | `place_rides.bike_model`(라이딩 시점 기종 스냅샷 + 백필) + `place_ride_summary`/`my_ride_stats` RPC. 원시 행 select 는 본인 것만으로 축소 — user_id·장소·시각이 전부 공개면 특정인의 이동 이력이 된다. 공개 집계는 SECURITY DEFINER 함수가 담당 |
| `037_unregistered_ride_spots.sql` | `place_rides.place_id` nullable + 이름·좌표 — 미등록 목적지 도착 기록. 앱·공개 다이제스트에는 표시하지 않고, 제한된 운영 분석에만 쓴다 |
| `038_broadcast_notice.sql` | `broadcast_notice(title, body, data)` — 전체 가입자 공지(알림 행 + 푸시, Expo 100건 청크). execute 를 운영자(SQL Editor)로만 제한, 클라이언트 키로는 호출 불가. `data.url` 이면 알림 탭 시 앱 내 딥링크 |
| `20260814133044_edge_rate_limits.sql` | 외부 유료 API용 원자적 고정 윈도우 호출 제한. 요청자 식별자는 `RATE_LIMIT_SALT`로 HMAC 처리해 원문 IP·user_id를 저장하지 않고, 테이블·RPC는 `service_role`만 접근 |
| `20260817103053_restrict_unregistered_ride_spots.sql` | 미등록 도착지 집계 RPC의 공개 실행 권한 회수 — `service_role` 운영만 허용 |
| `20260817104023_add_private_ride_candidate_scores.sql` | 미등록 도착지 후보를 라이더 수·반복·최근성으로 점수화한 `private.unregistered_ride_candidates`. 주거지 이름 제외, `service_role` 전용 |

---

## 7. 외부 연동

| 연동 | 위치 | 용도 |
|---|---|---|
| 네이버 지도 SDK | `@mj-studio/react-native-naver-map`, app.config `NAVER_MAP_CLIENT_ID` | 지도 렌더·마커·경로선. `patches/`로 심벌 탭 노출(새 빌드에만 반영) |
| 카카오모빌리티 길찾기 | `lib/api/directions.ts`, `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 미리보기 경로선의 **혼잡도 색칠**(`car_type=7`, 다중 경유지 POST의 `traffic_state`). 경로 자체는 같은 엔진인 KNSDK 가 뽑고, REST 실패 시 단색 폴백. 일 10,000건 무료 |
| 네이버 Geocoding | `supabase/functions/naver-geocode` + `lib/geocode.ts` | 코스 제보의 수동 주소 입력 폴백. API secret은 Edge Function에만 두고 입력·호출량 제한 적용 |
| 네이버 Directions | `scripts/recalc-course-routes.mjs` (`NAVER_CLOUD_CLIENT_ID/SECRET`) | 코스 경로 재계산 폴백(스크립트 전용 — 앱 코드에서는 제거) |
| 카카오 로컬 검색 | `lib/api/kakaoLocal.ts` (`EXPO_PUBLIC_KAKAO_REST_API_KEY`) | 제보 주소 검색(상호+주소→좌표), 일반 목적지 도착 후 간편 제보용 역지오코딩 |
| 앱 안 길안내 | `lib/navigation.ts` + `app/navi.tsx`(+`components/navi/`, `hooks/useBikeRoutes.ts`) + `modules/kakao-navi/` | KNSDK 이륜차 턴바이턴. 출발 전 날씨·노면 위험 확인 후 진입. 미리보기 지도·경로 확보(옵션 캐시·경유지 축소 사다리)는 분리된 컴포넌트·훅이 맡는다 |
| Supabase Storage | `lib/uploadImage.ts` | 리뷰·제보 사진 (`ridemap-media` 버킷, base64 업로드) |
| Expo Push | `lib/push.ts` + migration 006/008 | 제보(장소·코스) 승인 푸시 — 토큰은 `push_tokens`, 발송은 DB 트리거(pg_net→Expo Push API). 권한 요청은 제보 직후에만 |
| Claude API | `supabase/functions/judge-submission` | 제보 AI 판정 — 트리거가 EF 호출 → 카카오 교차검증 + 웹 조사 → `claude-opus-4-8` 판정 → 디스코드에 근거·반려 안내 문구·[승인]/[반려] 버튼 발송. 제보자용 반려 문구는 `ai_reject_reason`에 저장 |
| 디스코드 봇 심사·답변 | `supabase/functions/discord-interactions` | Interactions Endpoint(Ed25519 검증). 판정 메시지의 [승인]/[반려] 버튼 → 즉시 처리 + 원 메시지 업데이트, 건의 메시지의 [답변하기] 버튼 → 인풋 모달 → `feedback.reply` 저장(021 트리거가 건의자 알림·푸시). secrets: `DISCORD_PUBLIC_KEY`. 발송은 judge-submission·021 트리거가 봇 API(`DISCORD_BOT_TOKEN`/`DISCORD_CHANNEL_ID`, vault 는 `discord_bot_token`/`discord_channel_id`) — 봇 미설정 시 웹훅 폴백. JWT 검증 OFF |
| 원클릭 심사 (폴백) | `supabase/functions/moderate` | 봇 미설정 시 웹훅 메시지의 승인·반려 링크(HMAC 서명) 탭 = 즉시 처리. 크롤러 방어는 봇 UA 필터+HEAD 무시+`<>` 임베드 억제. 반려 시 `ai_reject_reason`→`rejected_reason` 복사. JWT 검증 OFF. ⚠️ EF는 HTML 응답 불가(게이트웨이가 text/plain+CSP sandbox 로 강제) — 응답은 JSON |
| 오피넷 유가 | `supabase/functions/gas-stations` + `lib/api/gasStations.ts`, `hooks/useGasStations.ts`·`useGasLayer.ts` | 주유소 필터 시 실시간 유가 레이어 — EF가 키 은닉·KATEC↔WGS84 변환·3분 캐시, 앱은 가격 마커(최저가 강조)+상세 카드. 주의: 오피넷 인증 파라미터는 `code=`(문서의 certkey 아님), 브랜드 필드는 aroundAll `POLL_DIV_CD`/detailById `POLL_DIV_CO`로 상이, 반경 최대 5km — 검색 커버리지는 뷰포트 적응(확대 시 화면 맞춤 반경 1콜, 축소 시 5km 원 최대 3×3 타일 병합·중복 제거) |
| 기상청 날씨·특보 | `supabase/functions/weather-kr`·`weather-warnings` + `lib/api/weather.ts` | 시간대별 예보(단기+초단기 병합)와 "지금" 관측(초단기실황), 전국 특보 통보문 파싱(지역 매칭은 클라이언트 — 세부구역·제외 표기 대응). 네이버·아이폰과 같은 원천 |
| 에어코리아 미세먼지 | `supabase/functions/air-kr` (+029 DB 캐시) | 최근접 측정소 PM10/PM2.5 실시간 등급 — 원 API가 10~26초라 DB 캐시 필수 |
| 구글 Places 영업시간 | `supabase/functions/place-hours` + `hooks/usePlaceHours.ts` | 영업시간 폴백(등록 데이터 우선) — 캐시는 place_id 무기한·콘텐츠 30일(약관 상한, 034). 등록 장소는 DB 원본으로 검증하고 일반 POI 키는 좌표+상호에서 서버가 재생성하며, 5분/일일 호출 제한으로 Google 비용·캐시 오염 방어 |
| AI 추천 챗 | `supabase/functions/moto-chat` + `app/chat.tsx` | 등록 장소·코스 안에서만 추천하는 대화형 도우미 — 위치·내 바이크 컨텍스트 반영. 본문·턴 길이 상한과 5분/일일 호출 제한으로 Anthropic 비용 공격 방어 (`RATE_LIMIT_SALT` secret 필요) |
| Sentry | `app/_layout.tsx`, `metro.config.js` | 에러·세션 추적 |
| moto-kr 데이터셋 | `constants/bikes.ts` ← `scripts/sync-bike-models.mjs` (`npm run sync:bikes`) | 기종 자동완성 목록의 단일 원본은 [moto-kr](https://github.com/starhn87/moto-kr) (KENCIS 인증 기반) — bikes.ts 는 생성 파일이므로 직접 수정 금지, 기종 변경은 moto-kr mapping 에 기여 후 동기화 |

---

## 8. 빌드 · 배포 · 설정

### `app.config.js` (동적, env → 네이티브)

- **버전/OTA**: `version` 1.1.0, `runtimeVersion: appVersion` 정책, updates 채널 `production`. 런타임이 빌드와 일치해야 OTA 적용.
- **권한**: iOS 위치(`NSLocationWhenInUse`)·사진 설명, Android `ACCESS_FINE/COARSE_LOCATION` — 모두 **지도의 현재 위치 표시용**(앱 사용 중에만).
- **플러그인**: expo-router, expo-location(앱 사용 중 위치), naver-map, kakao-core, expo-build-properties(네이버 Maven), sentry, `./plugins/withQuerySchemes`.
- **키**: `NAVER_MAP_CLIENT_ID`·`KAKAO_NATIVE_APP_KEY`·Sentry org/project·`EXPO_PUBLIC_*` (Supabase·네이버·Sentry DSN).

### `eas.json` 프로필

| 프로필 | 채널 | 특징 |
|---|---|---|
| development | development | dev client, 내부 배포 |
| preview | preview | 내부 배포, iOS 시뮬레이터 |
| production | production | `autoIncrement` 빌드번호, 스토어/TestFlight |

> 빌드·OTA 명령과 주의점(`.env` 셸 주입, `--platform ios` 필수 등)은 [CLAUDE.md](../CLAUDE.md), 안드로이드 출시는 [android-submission.md](android-submission.md) 참조.

---

## 9. 시드 · 스크립트 · E2E

**`scripts/`** (모두 Node, `.env` 직접 로드):
- `seed-bike-cafes.mjs`(15) · `seed-repair-shops.mjs`(2) · `seed-gear-shops.mjs`(4) — 주소를 네이버 지오코딩으로 좌표 변환 후 `places`에 삽입(`approved=true`).
- `seed-national-expansion.mjs`(장소 19 + 코스 8) — 전국 확장(강원·충청·전라·경상·제주). 장소는 카카오 로컬로 사전 검증한 좌표를 인라인, 코스 경유지는 실행 시 카카오 키워드 검색으로 해석해 `courses.coordinates`에 저장.
- `seed-moto-camping.mjs`(camping 7) — 모토캠핑 캠핑장. 마이그레이션 011 적용 후 실행.
- `seed-places-from-json.mjs`(범용) — `scripts/data/*.json`(name/category/address/lat/lng/description/tags, 좌표 사전 검증)을 읽어 삽입. 2026-07 운영자 추천 33 + 라이더 맛집 25 시드에 사용.
- `cleanup-places.mjs`(중복 삭제·태그 정규화) · `list-places.mjs`(카테고리별 감사) · `verify-place-coords.mjs`(`all_places` RPC로 좌표 누락 점검) · `normalize-addresses.mjs`(주소 시도 표기를 카카오와 같은 축약형으로 통일, `--dry` 지원) · `backfill-phones.mjs`(전화번호 빈 장소를 카카오 로컬에서 찾아 채움 — 이름 일치는 150m, 부분 일치는 50m 안에서만 인정, `--dry` 지원).
- `generate-markers.mjs`(카테고리 물방울 마커 PNG 생성, sharp) · `invert-theme.js`(라이트 아이콘→다크 변환, sharp).

**`constants/`**: `Colors`(테마) · `categories`(라벨·색) · `course`(거리/시간 포맷터) · `legal`(약관 본문) · `mapStyle`(기본 중심·줌) · `markerImages`(마커 경로) · `riderTags`(하이라이트 태그).

**`.maestro/`**: 메인 지도·코스·내 정보 플로우를 자동 실행해 App Store용 스크린샷을 캡처(`appId=com.ridemap.app`).

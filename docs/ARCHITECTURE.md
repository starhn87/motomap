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
│ Postgres+    │         │ 지도 SDK · Directions│      │ 카카오내비/딥링크  │
│ PostGIS·Auth │         │ · Geocoding          │      │ Sentry            │
│ ·Storage·RLS │         └────────────────────┘      └──────────────────┘
└──────────────┘
```

핵심 결정:
- **상태는 두 갈래** — 전역 UI·세션 상태는 zustand(`stores/`), 서버에서 온 데이터는 react-query(`hooks/`)가 캐싱한다. 둘을 섞지 않는다.
- **백엔드는 Supabase 단일** — 인증·DB·스토리지를 한곳에서. 공간 질의는 PostGIS RPC로 위임.
- **지도/경로/지오코딩은 네이버**, 턴바이턴 내비는 외부 앱 딥링크(카카오내비·T맵 등)로 위임 — 앱은 장소 탐색·제보에 집중한다.

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

- **부팅 초기화**(useEffect): `useAuthStore.initialize()` · `useNavPrefStore.loadDefaultApp()` · `useThemeStore.loadMode()` · 푸시 토큰 조용한 갱신(`registerPushToken(false)` — 권한 요청은 제보 직후에만) · Kakao SDK 초기화. 폰트 로드 완료 후 스플래시 해제.
- Sentry는 DSN이 있을 때만 init, 앱 전체를 `Sentry.wrap`.

### 탭 (`app/(tabs)/`)

| 탭 | 라우트 | 화면 | 하는 일 |
|---|---|---|---|
| 지도 | `/` | `index.tsx` | 지도+POI 탐색, 카테고리 필터, 검색, 마커 탭→상세, 경로 미리보기 |
| 탐색 | `/courses` | `courses.tsx` | 추천 코스 목록 ↔ "추천 목적지"(RecommendedPlaces) 토글 |
| 제보 | `/submit` | `submit.tsx` | 장소·코스·건의 3종 제보 폼 |
| 내 정보 | `/profile` | `profile.tsx` | 프로필·메뉴(설정·즐겨찾기·내 리뷰·내 제보·로그아웃) |

### 스택 / 모달 라우트 (루트 `Stack`에 등록)

| 라우트 | 진입점 | 화면 |
|---|---|---|
| `/settings` | 내 정보 | 테마·기본 내비 앱·계정 탈퇴 |
| `/edit-nickname` | 내 정보 | 닉네임 변경(중복 확인·랜덤 생성) |
| `/favorites` | 내 정보 | 즐겨찾기 장소 → 탭 시 외부 내비 |
| `/my-submissions` | 내 정보 | 내 제보 + 승인 상태 |
| `/my-reviews` | 내 정보 | 내가 쓴 리뷰 |
| `/blocked-users` | 내 정보 | 차단 관리(해제) |
| `/legal/[type]` | 설정 | 약관·개인정보·위치 문서 (`type` 동적) |
| `/course/[id]` | 코스 목록·검색 | 코스 상세 + 리뷰 + 경로 미리보기 |

### 인증 게이팅

제보·내 정보 탭은 로그인이 필요하다. 비로그인 시 라우트 이동이 아니라 `components/auth/LoginPrompt`를 조건부 렌더한다. 세션은 `useAuthStore`(Supabase Auth)가 들고 있다.

### 화면 구성 하이라이트

- **지도 화면(`(tabs)/index.tsx`)** — `NaverMapView` 위에 오버레이를 쌓는다: 클러스터/마커(`PlaceMarker`), 사용자 위치(`UserLocationMarker`+`LocationPulse`), 경로선(`RouteLine`). UI 레이어로 `SearchBar`·`CategoryFilter`·내 위치 버튼·`PlaceBottomSheet`(선택 장소)·`RouteInfoCard`(경로 미리보기 시). 카메라 이동(`onCameraChanged`)을 디바운스해 `usePlaces`를 재조회.

---

## 5. 상태 관리

### Zustand 스토어 (`stores/`)

| 스토어 | 상태 | 영속(AsyncStorage) |
|---|---|---|
| `useAuthStore` | `user` · `session` · `loading` | — (Supabase가 세션 관리, Sentry user 동기화) |
| `useMapStore` | `userLocation` · `selectedPlaceId` · `activeFilter` | — (휘발성 지도 UI) |
| `useNavPrefStore` | `defaultApp` (기본 내비 앱) | `nav-default-app` |
| `useThemeStore` | `mode` (`system`/`light`/`dark`) | `theme-mode` |

### React Query (`hooks/`)

서버에서 온 모든 데이터는 react-query가 캐싱한다. mutation은 `onSuccess`에서 관련 키를 무효화(§2).

**Query key 컨벤션:**

| 도메인 | 키 |
|---|---|
| 장소(반경/전체) | `['places', lat, lng, radius, category]` · `['places']` · `['places','recommended']` |
| 장소 상세 | `['place', id]` |
| 코스 | `['courses']` · `['courses','detail', id]` |
| 리뷰 / 코스리뷰 | `['reviews', placeId]` · `['course-reviews', courseId]` |
| 즐겨찾기 | `['favorites', userId]` |
| 차단 | `['blocks','ids', userId]` · `['blocks','users', userId]` |

> `useUserLocation`은 react-query가 아니다 — expo-location으로 권한·현재 위치·방향(heading)을 watch하고 `useMapStore.setUserLocation()`에 흘려보낸다.

---

## 6. 도메인 모델 & DB 스키마

### 타입 (`types/index.ts`)

- **`PlaceCategory`** = `cafe` · `restaurant` · `rest_stop` · `gas_station` · `repair_shop` · `viewpoint` · `gear_shop` · `camping` (8종, DB `places_category_check`와 일치)
- **`Place`** — 좌표(lat/lng)·주소·전화·영업시간·주차정보·사진[]·태그[]·평점·리뷰수·`submittedBy`·`approved`
- **`RidingCourse`** — 거리(km)·소요(분)·`coordinates [lng,lat][]`·`waypoints: Place[]`·평점
- **`Review`** — `placeId`·`userId`·`userName`·`avatarUrl`·평점·내용·사진[]

> ⚠️ 좌표 순서 주의: 타입과 DB는 GeoJSON 순서 **`[lng, lat]`**, 네이버 지도 API·`Coord`는 **`{latitude, longitude}`**. 변환은 주로 API 래퍼에서 일어난다.

### 테이블 & RPC

| 테이블 | 출처 | 비고 |
|---|---|---|
| `places` | 원격(마이그레이션 외) | `location` PostGIS `POINT(lng lat)`, `places_category_check`(8종, 004 `gear_shop` · 011 `camping` 추가) |
| `courses` | 원격 | `coordinates` jsonb |
| `reviews` · `course_reviews` | 원격 | `profiles` 조인(닉네임·아바타) |
| `favorites` | 원격 | (user_id, place_id) |
| `profiles` | 원격 (+002) | `deleted_at` 소프트 삭제 플래그 |
| `reports` | **001** | target_type·reason·status, (reporter,target) 유니크 |
| `blocks` | **001** | (blocker, blocked) 유니크 + self-block 방지 |
| `feedback` | 원격 | type(bug/feature/general) |

**RPC 함수:**
- `nearby_places(lat, lng, radius_meters, category_filter)` — PostGIS 반경 + 카테고리 질의
- `all_places(category_filter)` — 카테고리 질의(전체)
- `delete_my_account()` (SECURITY DEFINER, 002) — 프로필 익명화 + `deleted_at` 설정

> 📌 `places`/`courses`/`reviews`/`course_reviews`/`favorites`/`profiles`의 **CREATE는 마이그레이션 파일에 없다** — 원격 Supabase에서 직접 생성됐고, 위 컬럼은 `lib/api/*`에서 역추론한 것이다. 마이그레이션 001·002·004는 그 위에 reports/blocks·계정 탈퇴·gear_shop을 얹는다(003 `rides`는 주행 기능 제거로 현재 미사용).

**RLS** — reports/blocks는 "본인 행만" 정책(select/insert/update/delete가 `auth.uid()` 기준).

### 마이그레이션 요약 (`supabase/migrations/`)

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

---

## 7. 외부 연동

| 연동 | 위치 | 용도 |
|---|---|---|
| 네이버 지도 SDK | `@mj-studio/react-native-naver-map`, app.config `NAVER_MAP_CLIENT_ID` | 지도 렌더·마커·경로선 |
| 네이버 Directions | `lib/api/directions.ts` (`EXPO_PUBLIC_NAVER_CLIENT_ID/SECRET`) | 경로 미리보기(거리·시간·geometry) |
| 네이버 Geocoding | `lib/geocode.ts` | 주소→좌표 (코스 제보 fallback) |
| 카카오 로컬 검색 | `lib/api/kakaoLocal.ts` (`EXPO_PUBLIC_KAKAO_REST_API_KEY`) | 제보 주소 검색 (상호+주소→좌표) |
| 외부 내비 딥링크 | `lib/navigation.ts` + `plugins/withQuerySchemes.js` | 카카오내비(이륜차)·T맵·카카오맵·네이버지도·Apple 지도. `LSApplicationQueriesSchemes`로 설치 감지, 기본 앱은 `useNavPrefStore` |
| Supabase Storage | `lib/uploadImage.ts` | 리뷰·제보 사진 (`ridemap-media` 버킷, base64 업로드) |
| Expo Push | `lib/push.ts` + migration 006/008 | 제보(장소·코스) 승인 푸시 — 토큰은 `push_tokens`, 발송은 DB 트리거(pg_net→Expo Push API). 권한 요청은 제보 직후에만 |
| Claude API | `supabase/functions/judge-submission` (배포명 `smart-task`) | 제보 AI 판정 — 트리거가 EF 호출 → 카카오 교차검증 + 웹 조사 → `claude-opus-4-8` 판정 → 디스코드에 근거·반려 안내 문구·[승인]/[반려] 버튼 발송. 제보자용 반려 문구는 `ai_reject_reason`에 저장 |
| 원클릭 심사 | `supabase/functions/moderate` | 디스코드 판정 메시지의 승인·반려 링크(HMAC 서명) 탭 = 즉시 처리, 결과는 디스코드 완료 로그로 확인. 크롤러 방어는 봇 UA 필터+HEAD 무시+`<>` 임베드 억제. 반려 시 `ai_reject_reason`→`rejected_reason` 복사로 015 알림에 사유 포함. JWT 검증 OFF. ⚠️ EF는 HTML 응답 불가(게이트웨이가 text/plain+CSP sandbox 로 강제) — 응답은 JSON |
| 오피넷 유가 | `supabase/functions/gas-stations` + `lib/api/gasStations.ts`, `hooks/useGasStations.ts` | 주유소 필터 시 실시간 유가 레이어 — EF가 키 은닉·KATEC↔WGS84 변환·3분 캐시, 앱은 가격 마커(최저가 강조)+상세 카드. 주의: 오피넷 인증 파라미터는 `code=`(문서의 certkey 아님), 브랜드 필드는 aroundAll `POLL_DIV_CD`/detailById `POLL_DIV_CO`로 상이, 반경 최대 5km(줌 게이트 `GAS_MIN_ZOOM`) |
| Sentry | `app/_layout.tsx`, `metro.config.js` | 에러·세션 추적 |

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
- `cleanup-places.mjs`(중복 삭제·태그 정규화) · `list-places.mjs`(카테고리별 감사) · `verify-place-coords.mjs`(`all_places` RPC로 좌표 누락 점검).
- `generate-marker-images.swift`(카테고리 마커 PNG 생성) · `invert-theme.js`(라이트 아이콘→다크 변환, sharp).

**`constants/`**: `Colors`(테마) · `categories`(라벨·아이콘·색) · `course`(거리/시간 포맷터) · `legal`(약관 본문) · `mapStyle`(기본 중심·줌) · `markerImages`(마커 경로) · `riderTags`(하이라이트 태그).

**`.maestro/`**: 메인 지도·코스·내 정보 플로우를 자동 실행해 App Store용 스크린샷을 캡처(`appId=com.ridemap.app`).

# RideMap 아키텍처

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
│   │  전역 UI·세션·주행 │   서버 상태·캐싱        │                │
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
- **상태는 두 갈래** — 전역 UI·세션·주행 상태는 zustand(`stores/`), 서버에서 온 데이터는 react-query(`hooks/`)가 캐싱한다. 둘을 섞지 않는다.
- **백엔드는 Supabase 단일** — 인증·DB·스토리지를 한곳에서. 공간 질의는 PostGIS RPC로 위임.
- **지도/경로/지오코딩은 네이버**, 턴바이턴 내비는 외부 앱 딥링크(카카오내비·T맵 등)로 위임 — 앱은 기록·탐색에 집중한다.

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
  (tabs)/               하단 탭 5개 (지도·코스·주행·제보·마이)
  ride/                 주행: active(실시간 추적) · [id](상세)
  course/[id].tsx       코스 상세 + 리뷰
  legal/[type].tsx      약관·정책 뷰어
  settings·favorites·my-reviews·my-submissions·blocked-users·edit-nickname
components/             재사용 UI — map · review · ride · submit · auth · search · report · explore · ui
hooks/                  react-query 훅 (서버 상태)
stores/                 zustand 스토어 (전역 상태)
lib/                    Supabase 클라이언트 · API 래퍼(api/) · 도메인 유틸
constants/             색·카테고리·포맷터·법무 문서·마커·태그
types/index.ts         도메인 타입 (Place·RidingCourse·Review·Ride)
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

- **부팅 초기화**(useEffect): `useAuthStore.initialize()` · `useNavPrefStore.loadDefaultApp()` · `useThemeStore.loadMode()` · Kakao SDK 초기화. 폰트 로드 완료 후 스플래시 해제.
- **백그라운드 위치 태스크 등록** — `import '@/stores/useRideStore'`를 모듈 최상단에서 수행한다. 이 import가 `TaskManager.defineTask(RIDE_LOCATION_TASK, …)`를 평가시켜, **앱이 종료된 상태에서 OS가 깨워도** 태스크 콜백이 살아있게 한다. (지우면 백그라운드 추적이 깨진다)
- Sentry는 DSN이 있을 때만 init, 앱 전체를 `Sentry.wrap`.

### 탭 (`app/(tabs)/`)

| 탭 | 라우트 | 화면 | 하는 일 |
|---|---|---|---|
| 지도 | `/` | `index.tsx` | 지도+POI 탐색, 카테고리 필터, 검색, 마커 탭→상세, 경로 미리보기 |
| 코스 | `/courses` | `courses.tsx` | 추천 코스 목록 ↔ "추천 목적지"(RecommendedPlaces) 토글 |
| 주행 | `/rides` | `rides.tsx` | 주행 기록 목록·통계 요약, **시작 버튼**, 복구 배너 |
| 제보 | `/submit` | `submit.tsx` | 장소·코스·건의 3종 제보 폼 |
| 마이 | `/profile` | `profile.tsx` | 프로필·메뉴(설정·즐겨찾기·내 리뷰·내 제보·로그아웃) |

### 스택 / 모달 라우트 (루트 `Stack`에 등록)

| 라우트 | 진입점 | 화면 |
|---|---|---|
| `/settings` | 마이 | 테마·기본 내비 앱·계정 탈퇴 |
| `/edit-nickname` | 마이 | 닉네임 변경(중복 확인·랜덤 생성) |
| `/favorites` | 마이 | 즐겨찾기 장소 → 탭 시 외부 내비 |
| `/my-submissions` | 마이 | 내 제보 + 승인 상태 |
| `/my-reviews` | 마이 | 내가 쓴 리뷰 |
| `/blocked-users` | 마이 | 차단 관리(해제) |
| `/legal/[type]` | 설정 | 약관·개인정보·위치 문서 (`type` 동적) |
| `/course/[id]` | 코스 목록·검색 | 코스 상세 + 리뷰 + 경로 미리보기 |
| `/ride/active` | 주행 시작 | **실시간 추적** (헤더 없음·`gestureEnabled:false`·화면 켜둠) |
| `/ride/[id]` | 주행 목록 | 주행 상세 + 경로 + 통계 + 제목 수정/삭제 |

### 인증 게이팅

주행·제보·마이 탭은 로그인이 필요하다. 비로그인 시 라우트 이동이 아니라 `components/auth/LoginPrompt`를 조건부 렌더한다. 세션은 `useAuthStore`(Supabase Auth)가 들고 있다.

### 화면 구성 하이라이트

- **지도 화면(`(tabs)/index.tsx`)** — `NaverMapView` 위에 오버레이를 쌓는다: 클러스터/마커(`PlaceMarker`), 사용자 위치(`UserLocationMarker`+`LocationPulse`), 경로선(`RouteLine`). UI 레이어로 `SearchBar`·`CategoryFilter`·내 위치 버튼·`PlaceBottomSheet`(선택 장소)·`RouteInfoCard`(경로 미리보기 시). 카메라 이동(`onCameraChanged`)을 디바운스해 `usePlaces`를 재조회.
- **주행 화면(`ride/active.tsx`)** — `useKeepAwake()`로 화면 유지, 지도에 좌표 트레일을 실시간 그리며 마지막 좌표로 카메라 추종. HUD에 속도·거리·시간. 종료 시 `RideSummaryModal`.

---

## 5. 상태 관리

### Zustand 스토어 (`stores/`)

| 스토어 | 상태 | 영속(AsyncStorage) |
|---|---|---|
| `useAuthStore` | `user` · `session` · `loading` | — (Supabase가 세션 관리, Sentry user 동기화) |
| `useMapStore` | `userLocation` · `selectedPlaceId` · `activeFilter` | — (휘발성 지도 UI) |
| `useNavPrefStore` | `defaultApp` (기본 내비 앱) | `nav-default-app` |
| `useThemeStore` | `mode` (`system`/`light`/`dark`) | `theme-mode` |
| `useRideStore` | 주행 상태·좌표·거리·시간·속도 (§7) | `ride-in-progress` (`lib/ridePersist.ts` 경유) |

### React Query (`hooks/`)

서버에서 온 모든 데이터는 react-query가 캐싱한다. mutation은 `onSuccess`에서 관련 키를 무효화(§2).

**Query key 컨벤션:**

| 도메인 | 키 |
|---|---|
| 장소(반경/전체) | `['places', lat, lng, radius, category]` · `['places']` · `['places','recommended']` |
| 장소 상세 | `['place', id]` |
| 코스 | `['courses']` · `['courses','detail', id]` |
| 리뷰 / 코스리뷰 | `['reviews', placeId]` · `['course-reviews', courseId]` |
| 즐겨찾기 | `['favorites']` |
| 주행 | `['rides']` · `['rides','detail', id]` |
| 차단 | `['blocks','ids', userId]` · `['blocks','users', userId]` |

> `useUserLocation`은 react-query가 아니다 — expo-location으로 권한·현재 위치·방향(heading)을 watch하고 `useMapStore.setUserLocation()`에 흘려보낸다.

---

## 6. 도메인 모델 & DB 스키마

### 타입 (`types/index.ts`)

- **`PlaceCategory`** = `cafe` · `restaurant` · `rest_stop` · `gas_station` · `repair_shop` · `viewpoint` · `gear_shop` (7종, DB `places_category_check`와 일치)
- **`Place`** — 좌표(lat/lng)·주소·전화·영업시간·주차정보·사진[]·태그[]·평점·리뷰수·`submittedBy`·`approved`
- **`RidingCourse`** — 거리(km)·소요(분)·`coordinates [lng,lat][]`·`waypoints: Place[]`·평점
- **`Review`** — `placeId`·`userId`·`userName`·`avatarUrl`·평점·내용·사진[]
- **`Ride`** — `coordinates [lng,lat][]`·거리(km)·**소요(초)**·avg/max 속도(km/h)·`startedAt`/`endedAt`

> ⚠️ 좌표 순서 주의: 타입과 DB는 GeoJSON 순서 **`[lng, lat]`**, 네이버 지도 API·`Coord`는 **`{latitude, longitude}`**. 변환은 주로 ride 종료 시(`useRideStore.stop`)와 API 래퍼에서 일어난다.

### 테이블 & RPC

| 테이블 | 출처 | 비고 |
|---|---|---|
| `places` | 원격(마이그레이션 외) | `location` PostGIS `POINT(lng lat)`, `places_category_check`(7종, 004에서 `gear_shop` 추가) |
| `courses` | 원격 | `coordinates` jsonb |
| `reviews` · `course_reviews` | 원격 | `profiles` 조인(닉네임·아바타) |
| `favorites` | 원격 | (user_id, place_id) |
| `profiles` | 원격 (+002) | `deleted_at` 소프트 삭제 플래그 |
| `rides` | **003** | `coordinates` jsonb, `(user_id, created_at desc)` 인덱스 |
| `reports` | **001** | target_type·reason·status, (reporter,target) 유니크 |
| `blocks` | **001** | (blocker, blocked) 유니크 + self-block 방지 |
| `feedback` | 원격 | type(bug/feature/general) |

**RPC 함수:**
- `nearby_places(lat, lng, radius_meters, category_filter)` — PostGIS 반경 + 카테고리 질의
- `all_places(category_filter)` — 카테고리 질의(전체)
- `delete_my_account()` (SECURITY DEFINER, 002) — 프로필 익명화 + `deleted_at` 설정

> 📌 `places`/`courses`/`reviews`/`course_reviews`/`favorites`/`profiles`의 **CREATE는 마이그레이션 파일에 없다** — 원격 Supabase에서 직접 생성됐고, 위 컬럼은 `lib/api/*`에서 역추론한 것이다. 마이그레이션 001~004는 그 위에 reports/blocks·계정 탈퇴·rides·gear_shop을 얹는다.

**RLS** — reports/blocks/rides는 모두 "본인 행만" 정책(select/insert/update/delete가 `auth.uid()` 기준).

### 마이그레이션 요약 (`supabase/migrations/`)

| 파일 | 내용 |
|---|---|
| `001_reports_blocks.sql` | `reports`·`blocks` 테이블 + RLS |
| `002_account_deletion.sql` | `profiles.deleted_at` + `delete_my_account()` RPC |
| `003_rides.sql` | `rides` 테이블 + 인덱스 + RLS |
| `004_add_gear_shop_category.sql` | `places_category_check`에 `gear_shop` 추가 |

---

## 7. 주행 기록 파이프라인 (플래그십)

GPS로 라이딩을 기록하는 핵심 기능. 구현은 `stores/useRideStore.ts`에 집중돼 있고, 화면은 `app/ride/active.tsx`·`app/(tabs)/rides.tsx`, 영속은 `lib/ridePersist.ts`, 통계는 `lib/rideStats.ts`다.

### 상태 vs 모듈 스코프 분리

`useRideStore`의 **store state에는 화면이 구독할 직렬화 가능한 값만** 둔다(`status`·`coordinates`·`distanceM`·`durationSec`·`currentSpeed`·`maxSpeed`). 누적 계산용 핸들(`prevCoord`·`accumulatedMs`·`segmentStartedMs`·`startedAtMs`·`tickInterval`·`skipNextDistance`)은 **모듈 스코프 변수**다 — 백그라운드 태스크 콜백에서도 접근해야 하고 직렬화 대상이 아니기 때문.

`status: 'idle' | 'tracking' | 'paused'`.

### 단계별 흐름

```
1. 시작   rides.tsx 시작 버튼 → ride/active.tsx → useRideStore.start()
            · 포어그라운드 위치 권한 필수(거부 시 중단), 백그라운드 권한은 권장(거부해도 진행)
            · Location.startLocationUpdatesAsync(RIDE_LOCATION_TASK, BestForNavigation,
                distanceInterval 5m, timeInterval 1s, foregroundService[Android] 알림)
            · setInterval(onTick, 1s) 시작 → status='tracking'

2. 수집   OS가 위치 fix 전달 → TaskManager 태스크 콜백(RIDE_LOCATION_TASK) → processLocation()
            · 포어그라운드·백그라운드 동일 콜백 (iOS 백그라운드 표시줄, Android 상시 알림)

3. 처리   processLocation() 필터링 (잡음 제거):
            · 정확도 > 50m  fix 폐기 (ACCURACY_MAX_M)
            · 첫 fix / 재개 직후  기준점만 잡고 거리 누적 스킵
            · 점프 > 100m && 순간속도 > 55.5m/s(~200km/h)  GPS 스파이크로 폐기
            · 이동 < 3m  정지로 간주, 거리 누적 안 함 (STILL_MIN_M)
            · 정상  거리 += haversine, currentSpeed(센서 우선·이상치 폴백), maxSpeed 갱신, 좌표 append

4. 영속   onTick(1s)마다 durationSec 갱신 + persistSnapshot()
            · 5초 throttle (좌표 많아져도 매 tick 직렬화 안 함)
            · pause 등 중요한 전환은 force=true 즉시 저장
            · AsyncStorage 'ride-in-progress' (lib/ridePersist.ts)

5. 복구   앱 강제종료/크래시 후 재실행 → rides.tsx 가 스냅샷 탐지
            · RecoveredRideBanner 로 거리·시간 보여주고 저장/폐기 선택

6. 일시정지/재개   pause(): accumulatedMs 누적, 즉시 스냅샷
                   resume(): segmentStartedMs 재설정, skipNextDistance=true
                             (휴식 동안 이동이 직선으로 합산되는 것 방지)

7. 종료/요약   stop() → RideSummary 반환 (좌표를 [lng,lat]로 변환, avgSpeed 계산)
                · 스냅샷 삭제, status='idle'
                · 너무 짧으면(좌표<2 또는 <50m) 폐기
                · RideSummaryModal 에서 제목 입력

8. 저장   useSaveRide() → saveRide() → INSERT rides → invalidate ['rides']
            → ride/[id] 상세로 이동
```

### 통계 (`lib/rideStats.ts`)

저장된 주행들을 주간/월간/누적 버킷(거리·시간·횟수)으로 집계하고 최근 8주 추이 배열을 만든다 → `RideStatsSummary`가 주행 탭 상단에 카드로 표시.

---

## 8. 외부 연동

| 연동 | 위치 | 용도 |
|---|---|---|
| 네이버 지도 SDK | `@mj-studio/react-native-naver-map`, app.config `NAVER_MAP_CLIENT_ID` | 지도 렌더·마커·경로선 |
| 네이버 Directions | `lib/api/directions.ts` (`EXPO_PUBLIC_NAVER_CLIENT_ID/SECRET`) | 경로 미리보기(거리·시간·geometry) |
| 네이버 Geocoding | `lib/geocode.ts` | 주소→좌표 (코스/장소 제보) |
| 외부 내비 딥링크 | `lib/navigation.ts` + `plugins/withQuerySchemes.js` | 카카오내비(이륜차)·T맵·카카오맵·네이버지도·Apple 지도. `LSApplicationQueriesSchemes`로 설치 감지, 기본 앱은 `useNavPrefStore` |
| Supabase Storage | `lib/uploadImage.ts` | 리뷰·제보 사진 (`ridemap-media` 버킷, base64 업로드) |
| Sentry | `app/_layout.tsx`, `metro.config.js` | 에러·세션 추적 |

---

## 9. 빌드 · 배포 · 설정

### `app.config.js` (동적, env → 네이티브)

- **버전/OTA**: `version` 1.1.0, `runtimeVersion: appVersion` 정책, updates 채널 `production`. 런타임이 빌드와 일치해야 OTA 적용.
- **권한**: iOS `UIBackgroundModes:[location]` + 위치/사진 설명, Android `ACCESS_*_LOCATION`·`FOREGROUND_SERVICE(_LOCATION)` (백그라운드 주행 추적용).
- **플러그인**: expo-router, expo-location(백그라운드/포어그라운드 서비스), naver-map, kakao-core, expo-build-properties(네이버 Maven), sentry, `./plugins/withQuerySchemes`.
- **키**: `NAVER_MAP_CLIENT_ID`·`KAKAO_NATIVE_APP_KEY`·Sentry org/project·`EXPO_PUBLIC_*` (Supabase·네이버·Sentry DSN).

### `eas.json` 프로필

| 프로필 | 채널 | 특징 |
|---|---|---|
| development | development | dev client, 내부 배포 |
| preview | preview | 내부 배포, iOS 시뮬레이터 |
| production | production | `autoIncrement` 빌드번호, 스토어/TestFlight |

> 빌드·OTA 명령과 주의점(`.env` 셸 주입, `--platform ios` 필수 등)은 [CLAUDE.md](../CLAUDE.md) 참조.

---

## 10. 시드 · 스크립트 · E2E

**`scripts/`** (모두 Node, `.env` 직접 로드):
- `seed-bike-cafes.mjs`(15) · `seed-repair-shops.mjs`(2) · `seed-gear-shops.mjs`(4) — 주소를 네이버 지오코딩으로 좌표 변환 후 `places`에 삽입(`approved=true`).
- `cleanup-places.mjs`(중복 삭제·태그 정규화) · `list-places.mjs`(카테고리별 감사) · `verify-place-coords.mjs`(`all_places` RPC로 좌표 누락 점검).
- `generate-marker-images.swift`(카테고리 마커 PNG 생성) · `invert-theme.js`(라이트 아이콘→다크 변환, sharp).

**`constants/`**: `Colors`(테마) · `categories`(라벨·아이콘·색) · `course`(거리/시간/속도/날짜 포맷터) · `legal`(약관 본문) · `mapStyle`(기본 중심·줌) · `markerImages`(마커 경로) · `mockPlaces`(데모 6곳) · `riderTags`(하이라이트 태그).

**`.maestro/`**: 메인 지도·코스·마이 플로우를 자동 실행해 App Store용 스크린샷을 캡처(`appId=com.ridemap.app`).

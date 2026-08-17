import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import PostHog from 'posthog-react-native';

import type { RiderFactCode } from '@/constants/riderFacts';

// 제품 분석 — 어떤 경로로 장소를 찾아 실제로 달리는지, 어디서 이탈하는지.
// 설계와 금지 항목은 docs/analytics-events.md 참고. 크래시·성능은 Sentry 담당이라
// 여기서 중복 수집하지 않는다.
//
// 키가 없으면(로컬 개발, 미설정) 전체가 조용히 무효화된다 — 계측 때문에 앱이
// 깨지는 일은 없어야 한다.
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

// 개발 빌드는 보내지 않는다 — Sentry 와 같은 이유로, 개발 중 이벤트가 섞이면
// 퍼널 수치를 믿을 수 없게 된다.
const enabled = !!apiKey && !__DEV__;

export const posthog = enabled
  ? new PostHog(apiKey!, {
      host,
      enableSessionReplay: true,
      // RN 리플레이는 스크린샷 모드만 지원한다 — 화면이 통째로 찍히므로
      // 마스킹이 곧 개인정보 방어선이다. 아래 셋은 SDK 기본값도 true 지만
      // 실수로 꺼지면 바로 유출이라 의도를 코드에 남긴다.
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        maskAllSandboxedViews: true,
        // 콘솔 로그까지 리플레이에 실을 이유가 없다 — 진단은 Sentry 담당
        captureLog: false,
      },
    })
  : null;

// ── 이벤트 ────────────────────────────────────────────────────────────────

/** 장소를 어느 경로로 만났는지 — 발견 경로별 주행 전환을 가르는 축 */
export type PlaceSource =
  | 'map_marker'
  | 'search'
  | 'search_results'
  | 'favorite'
  | 'chat'
  | 'notification'
  | 'course'
  | 'share'
  | 'submission'
  | 'route_preview'
  | 'my_rides';

export type SearchSource = 'map_bar' | 'search_screen' | 'point_modal';
export type SearchResultType = 'registered' | 'kakao' | 'course';

type Props = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, properties?: Props) {
  if (!posthog) return;
  // 값이 없는 속성은 아예 빼고 보낸다 — undefined 가 섞이면 PostHog 쪽에서
  // 속성 타입이 흔들리고, 필터가 빈 값까지 세게 된다.
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(properties ?? {})) {
    if (v !== undefined) clean[k] = v;
  }
  posthog.capture(event, clean);
}

/** 서로 다른 화면을 지나도 같은 탐색·안내 흐름을 묶는 익명 세션 id */
export function createAnalyticsId(prefix: 'search' | 'guide'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const track = {
  searchSubmitted: (p: {
    search_id: string;
    method: 'typed' | 'voice';
    source: SearchSource;
    /** 내 장소(집·회사) 설정 플로우에서는 넘기지 않는다 — 민감 장소 */
    query?: string;
  }) => capture('search_submitted', p),

  /**
   * 등록 장소가 하나도 안 걸렸을 때. 카카오 일반 장소는 웬만한 문자열에 뭐라도
   * 돌려주므로 "둘 다 0건"만 세면 거의 안 찍힌다 — 정작 알고 싶은 건 *우리 DB* 가
   * 못 찾은 경우다.
   *
   * kakao_count 로 두 상황을 가른다:
   *   0  → 검색어 자체가 안 걸림(오타·엉뚱한 말)
   *   1+ → 실재하는 곳인데 우리에게 없음 = 제보 우선순위 목록
   */
  searchResultsViewed: (p: {
    search_id: string;
    source: SearchSource;
    query?: string;
    registered_count: number;
    kakao_count: number;
    course_count: number;
    scope: 'near' | 'all';
  }) => capture('search_results_viewed', p),

  searchNoResults: (p: {
    search_id: string;
    source: SearchSource;
    query?: string;
    kakao_count: number;
  }) =>
    capture('search_no_results', p),

  searchResultSelected: (p: {
    search_id: string;
    result_type: SearchResultType;
    rank: number;
    source: SearchSource;
  }) => capture('search_result_selected', p),

  searchFilterToggled: (p: {
    search_id: string;
    filter: 'open' | 'parking' | 'rating' | 'bike';
    on: boolean;
  }) =>
    capture('search_filter_toggled', p),

  searchAreaRefreshed: (p: { search_id: string }) => capture('search_area_refreshed', p),

  searchAreaBrowsed: (p: { search_id: string; source: SearchSource }) =>
    capture('search_area_browsed', p),

  courseSaved: (p: { on: boolean }) => capture('course_saved', p),

  courseCompleted: (p: { course_id: string }) => capture('course_completed', p),

  weekendRideOpened: (p: { recommendation_count: number }) =>
    capture('weekend_ride_opened', p),

  categoryFiltered: (p: { category: string }) => capture('category_filtered', p),

  placeViewed: (p: { place_id: string; category?: string; source: PlaceSource }) =>
    capture('place_viewed', p),

  navigationPreviewed: (p: {
    distance_m: number;
    duration_s: number;
    priority: number;
    via_count: number;
    has_custom_start: boolean;
  }) => capture('navigation_previewed', p),

  navigationStarted: (p: {
    guide_session_id: string;
    mode: 'live' | 'preview';
    priority: number;
    via_count: number;
    distance_m?: number;
  }) => capture('navigation_started', p),

  // abandoned = 안내 중 앱이 죽어(강제 종료·OS 종료 포함) 종료를 못 찍은
  // 세션을 다음 실행 때 정산한 것. 시작과 같은 id·mode 로 묶는다.
  navigationEnded: (p: {
    guide_session_id: string;
    reason: 'arrived' | 'cancelled' | 'abandoned';
    mode: 'live' | 'preview';
    duration_s?: number;
    distance_m?: number;
  }) =>
    capture('navigation_ended', p),

  routeFailed: (p: { code: number | null; via_count: number }) =>
    capture('route_failed', p),

  favoriteToggled: (p: {
    on: boolean;
    place_id: string;
    category?: string;
    source: PlaceSource;
  }) => capture('favorite_toggled', p),

  placeSubmissionPrompted: (p: { has_address: boolean }) =>
    capture('place_submission_prompted', p),

  placeSubmissionOpened: (p: { source: 'arrival' | 'temp_place' }) =>
    capture('place_submission_opened', p),

  // 제보 폼에는 사진 입력이 없다 — 카테고리와 진입 경로만 남긴다
  placeSubmitted: (p: {
    category: string;
    source: 'tab' | 'arrival' | 'temp_place';
  }) => capture('place_submitted', p),

  reviewSubmitted: (p: {
    target: 'place' | 'general' | 'course';
    rating: number;
    has_photo: boolean;
  }) => capture('review_submitted', p),

  bikeSetupViewed: (p: { has_bike: boolean }) => capture('bike_setup_viewed', p),

  bikeSetupSaved: (p: {
    action: 'registered' | 'updated' | 'removed' | 'unchanged';
    canonical: boolean;
    category?: string;
  }) => capture('bike_setup_saved', p),

  bikeRideHistoryOpened: (p: { source: 'bike_setup' | 'profile' | 'bike_hero' }) =>
    capture('bike_ride_history_opened', p),

  bikePassportShared: (p: { scope: 'all' | 'bike'; places: number; rides: number }) =>
    capture('bike_passport_shared', p),

  bikeGarageChanged: (p: {
    action: 'added' | 'edited' | 'activated' | 'removed';
    bike_count: number;
  }) => capture('bike_garage_changed', p),

  riderFactToggled: (p: { fact: RiderFactCode; on: boolean }) =>
    capture('rider_fact_toggled', p),

  bikeRecommendationsViewed: (p: { recommendation_count: number }) =>
    capture('bike_recommendations_viewed', p),

  bikeRecommendationSelected: (p: { match: 'same_model' | 'same_category' }) =>
    capture('bike_recommendation_selected', p),

  chatMessageSent: (p: { turn_index: number }) => capture('chat_message_sent', p),

  appOpenedFromLink: (p: { campaign?: string; source?: string }) =>
    capture('app_opened_from_link', p),
};

// ── 사용자 식별 ───────────────────────────────────────────────────────────

/**
 * 로그인 시 익명 id 를 계정에 잇는다. alias 를 먼저 부르지 않으면 가입 전
 * 탐색 기록이 끊겨 "둘러보다 가입" 전환을 볼 수 없다.
 */
export function identifyUser(userId: string) {
  if (!posthog) return;
  posthog.alias(userId);
  posthog.identify(userId);
}

export function resetUser() {
  posthog?.reset();
}

// ── 화면 조회 ─────────────────────────────────────────────────────────────

// expo-router 는 NavigationContainer 를 노출하지 않아 PostHog 의 화면 자동
// 수집이 동작하지 않는다(SDK 타입 주석에 명시). 경로를 직접 구독해 보낸다.
//
// 동적 세그먼트는 값이 아니라 패턴으로 — /course/abc-123 을 그대로 보내면
// 화면이 장소 수만큼 쪼개져 집계가 무의미해진다.
const DYNAMIC_ROUTES: [RegExp, string][] = [
  [/^\/course\/[^/]+$/, '/course/[id]'],
  [/^\/legal\/[^/]+$/, '/legal/[type]'],
];

function toScreenName(pathname: string): string {
  for (const [pattern, name] of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return name;
  }
  return pathname;
}

export function useScreenTracking() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog) return;
    const screen = toScreenName(pathname);
    // 같은 화면에서의 파라미터 변경까지 조회로 세지 않는다
    if (last.current === screen) return;
    last.current = screen;
    void posthog.screen(screen);
  }, [pathname]);
}

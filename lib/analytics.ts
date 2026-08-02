import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import PostHog from 'posthog-react-native';

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
  ? new PostHog(apiKey!, { host, enableSessionReplay: true })
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
  | 'submission';

export type SearchSource = 'map_bar' | 'search_screen' | 'point_modal';

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

export const track = {
  searchSubmitted: (p: {
    method: 'typed' | 'voice';
    source: SearchSource;
    /** 내 장소(집·회사) 설정 플로우에서는 넘기지 않는다 — 민감 장소 */
    query?: string;
  }) => capture('search_submitted', p),

  searchNoResults: (p: { source: SearchSource; query?: string }) =>
    capture('search_no_results', p),

  searchResultSelected: (p: {
    result_type: 'registered' | 'kakao' | 'course';
    rank: number;
    source: SearchSource;
  }) => capture('search_result_selected', p),

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
    mode: 'live' | 'preview';
    priority: number;
    via_count: number;
    distance_m?: number;
  }) => capture('navigation_started', p),

  navigationEnded: (p: { reason: 'arrived' | 'cancelled' }) =>
    capture('navigation_ended', p),

  routeFailed: (p: { code: number | null; via_count: number }) =>
    capture('route_failed', p),

  favoriteToggled: (p: {
    on: boolean;
    place_id: string;
    category?: string;
    source: PlaceSource;
  }) => capture('favorite_toggled', p),

  // 제보 폼에는 사진 입력이 없다 — 카테고리만 남긴다
  placeSubmitted: (p: { category: string }) => capture('place_submitted', p),

  reviewSubmitted: (p: {
    target: 'place' | 'course';
    rating: number;
    has_photo: boolean;
  }) => capture('review_submitted', p),

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

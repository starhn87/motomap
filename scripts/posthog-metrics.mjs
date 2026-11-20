// 주간 다이제스트와 관리자 화면이 같이 쓰는 PostHog HogQL.
// 창은 실행 시각 기준 rolling 7일과 그 직전 7일이다. 달력 주가 아니다.
//
// 도착률은 두 가지다.
// - 관리자 화면과 다이제스트의 기존 정의 줄: endReasonsQuery. reason=arrived 이벤트 수.
//   had_arrived 로 바꾸지 않는다.
// - 주간 다이제스트의 현재 정의(2026-11-20): liveEndSessionQuery 의 guide_session_id.
//   reason=arrived 이거나 had_arrived 이면 도착이다. 그 세션은 중도 종료·비정상 종료·
//   process_end 버킷에 넣지 않는다.

export const CURRENT_WINDOW = 'timestamp >= now() - INTERVAL 7 DAY';
export const PREVIOUS_WINDOW = 'timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY';

export const DIGEST_EVENTS = [
  ['search_submitted', '검색'],
  ['search_results_viewed', '검색 결과 노출'],
  ['search_result_selected', '검색 결과 선택'],
  ['search_area_browsed', '이 지역 둘러보기'],
  ['category_filtered', '카테고리 필터'],
  ['place_viewed', '장소 상세 조회'],
  ['navigation_previewed', '경로 미리보기'],
  ['navigation_started', '길안내 시작'],
  ['navigation_ended', '길안내 종료'],
  ['route_failed', '경로 탐색 실패'],
  ['favorite_toggled', '즐겨찾기 토글'],
  ['review_submitted', '리뷰 작성'],
  ['place_submitted', '장소 제보'],
  ['place_submission_prompted', '도착 후 장소 제보 제안'],
  ['place_submission_opened', '장소 제보 열기'],
  ['place_submission_attempted', '장소 제보 시도'],
  ['bike_setup_saved', '내 바이크 저장'],
  ['bike_ride_history_opened', '라이딩 기록 조회'],
  ['chat_message_sent', 'AI 챗 메시지'],
  ['app_opened_from_link', '링크 유입'],
];

export function delta(cur, prev) {
  if (prev === 0) return cur > 0 ? 'new' : '—';
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

export function kstDay(offset, now = Date.now()) {
  const date = new Date(now + 9 * 3600 * 1000 - offset * 86400000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function wauQuery() {
  return `
    SELECT
      count(DISTINCT if(${CURRENT_WINDOW}, person_id, NULL)) AS cur,
      count(DISTINCT if(${PREVIOUS_WINDOW}, person_id, NULL)) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
  `;
}

export function eventCountsQuery(events = DIGEST_EVENTS) {
  return `
    SELECT event, countIf(${CURRENT_WINDOW}) AS cur, countIf(${PREVIOUS_WINDOW}) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event IN (${events.map(([event]) => `'${event}'`).join(', ')})
    GROUP BY event
  `;
}

export function liveNavigationQuery() {
  return `
    SELECT
      count(DISTINCT if(${CURRENT_WINDOW}, properties.guide_session_id, NULL)) AS cur,
      count(DISTINCT if(${PREVIOUS_WINDOW}, properties.guide_session_id, NULL)) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event = 'navigation_started' AND properties.mode = 'live'
      AND properties.guide_session_id IS NOT NULL
  `;
}

export function endReasonsQuery() {
  return `
    SELECT properties.reason AS reason, count() AS n
    FROM events
    WHERE ${CURRENT_WINDOW} AND event = 'navigation_ended'
      AND properties.mode = 'live'
      AND properties.guide_session_id IS NOT NULL
    GROUP BY reason
  `;
}

// 세션 행: [id, arrived 이벤트 수, cancelled 이벤트 수, abandoned 이벤트 수, process_end 이벤트 수, had_arrived 이벤트 수]
// HogQL 기본 100행 한도를 넘기지 않도록 LIMIT 를 쿼리에 둔다.
export const LIVE_END_SESSION_LIMIT = 10000;

export function liveEndSessionQuery() {
  return `
    SELECT
      properties.guide_session_id AS id,
      countIf(properties.reason = 'arrived') AS arrived_events,
      countIf(properties.reason = 'cancelled') AS cancelled_events,
      countIf(properties.reason = 'abandoned') AS abandoned_events,
      countIf(properties.exit = 'process_end') AS process_end_events,
      countIf(
        properties.had_arrived = true
        OR properties.had_arrived = 'true'
        OR properties.had_arrived = 1
      ) AS arrived_flags
    FROM events
    WHERE ${CURRENT_WINDOW} AND event = 'navigation_ended'
      AND properties.mode = 'live'
      AND properties.guide_session_id IS NOT NULL
    GROUP BY properties.guide_session_id
    LIMIT ${LIVE_END_SESSION_LIMIT}
  `;
}

export function classifyLiveEndSession(row) {
  const arrivedEvents = Number(row[1] ?? 0);
  const cancelledEvents = Number(row[2] ?? 0);
  const abandonedEvents = Number(row[3] ?? 0);
  const processEndEvents = Number(row[4] ?? 0);
  const arrivedFlags = Number(row[5] ?? 0);
  if (arrivedEvents > 0 || arrivedFlags > 0) return 'arrived';
  if (cancelledEvents > 0) return 'cancelled';
  if (abandonedEvents > 0 || processEndEvents > 0) return 'abandoned';
  return 'other';
}

export function summarizeLiveEndSessions(rows) {
  const byId = new Map();
  for (const row of rows) {
    const id = String(row[0]);
    const prev = byId.get(id) ?? [id, 0, 0, 0, 0, 0];
    for (let index = 1; index <= 5; index += 1) prev[index] += Number(row[index] ?? 0);
    byId.set(id, prev);
  }
  const counts = { arrived: 0, cancelled: 0, abandoned: 0, other: 0 };
  for (const row of byId.values()) counts[classifyLiveEndSession(row)] += 1;
  return counts;
}

export function formatLiveArrivalLines(liveStarted, sessions, legacy) {
  if (liveStarted <= 0) return [];
  const percent = (count) => `${Math.round((count / liveStarted) * 100)}%`;
  const lines = [
    `**실주행 도착률(정의 변경: 도착 또는 had_arrived, 세션)**: ${percent(sessions.arrived)} (시작 ${liveStarted} · 도착 ${sessions.arrived} · 중도 종료 ${sessions.cancelled} · 비정상 종료 ${sessions.abandoned})`,
    `**실주행 도착률(기존 정의: reason=arrived 이벤트)**: ${percent(legacy.arrived)} (시작 ${liveStarted} · 도착 ${legacy.arrived} · 중도 종료 ${legacy.cancelled} · 비정상 종료 ${legacy.abandoned})`,
  ];
  return lines;
}

export function endExitsQuery() {
  return `
    SELECT properties.exit AS exit, properties.had_arrived AS had_arrived, count() AS n
    FROM events
    WHERE ${CURRENT_WINDOW} AND event = 'navigation_ended'
      AND properties.mode = 'live'
      AND properties.guide_session_id IS NOT NULL
      AND properties.exit IS NOT NULL
    GROUP BY exit, had_arrived
    ORDER BY n DESC
  `;
}

export function searchSessionsQuery() {
  return `
    SELECT
      count(DISTINCT if(${CURRENT_WINDOW} AND event = 'search_results_viewed', properties.search_id, NULL)) AS viewed_cur,
      count(DISTINCT if(${CURRENT_WINDOW} AND event = 'search_result_selected', properties.search_id, NULL)) AS selected_cur,
      count(DISTINCT if(${PREVIOUS_WINDOW} AND event = 'search_results_viewed', properties.search_id, NULL)) AS viewed_prev,
      count(DISTINCT if(${PREVIOUS_WINDOW} AND event = 'search_result_selected', properties.search_id, NULL)) AS selected_prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event IN ('search_results_viewed', 'search_result_selected')
      AND properties.search_id IS NOT NULL
  `;
}

export function submissionAttemptsQuery() {
  return `
  SELECT properties.result AS result, count() AS n
  FROM events
  WHERE ${CURRENT_WINDOW} AND event = 'place_submission_attempted'
  GROUP BY result
  ORDER BY n DESC
`;
}

// 관리자 퍼널. 계측된 세 이벤트만 센다. 목업의 위치 선택·내용 입력은 이벤트가 없다.
export function submissionFunnelQuery() {
  return `
    SELECT
      countIf(event = 'place_submission_opened') AS opened,
      countIf(event = 'place_submission_attempted') AS attempted,
      countIf(event = 'place_submitted') AS submitted
    FROM events
    WHERE ${CURRENT_WINDOW}
      AND event IN ('place_submission_opened', 'place_submission_attempted', 'place_submitted')
  `;
}

// 오류 수집 계약. JS는 posthog-react-native, iOS 네이티브 크래시 경로는 posthog-ios.
// 건수는 수신 이벤트다. 심볼 해석 완료를 뜻하지 않는다.
export function exceptionCountQuery() {
  return `
    SELECT
      countIf(properties.$lib = 'posthog-react-native') AS js_count,
      countIf(properties.$lib = 'posthog-ios') AS native_count,
      countIf(
        properties.$lib IS NULL
        OR (
          properties.$lib != 'posthog-react-native'
          AND properties.$lib != 'posthog-ios'
        )
      ) AS other_count
    FROM events
    WHERE ${CURRENT_WINDOW}
      AND event = '$exception'
  `;
}

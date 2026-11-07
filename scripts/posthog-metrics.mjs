// 주간 다이제스트와 관리자 화면이 같이 쓰는 PostHog HogQL.
// 창은 실행 시각 기준 rolling 7일과 그 직전 7일이다. 달력 주가 아니다.
// 도착률 분모·분자는 이 파일의 live 세션과 reason=arrived 뿐이다.
// had_arrived 는 종료 계기 진단이며 도착률을 다시 정의하지 않는다.

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

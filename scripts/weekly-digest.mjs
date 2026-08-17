// 주간 운영 다이제스트 — PostHog 지표를 HogQL 로 조회해 마크다운으로 출력한다.
// GitHub Actions(.github/workflows/weekly-digest.yml)가 매주 월요일 실행해
// 이슈로 올린다. 로컬 실행도 가능:
//   POSTHOG_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 node scripts/weekly-digest.mjs
//
// 필요한 환경변수:
//   POSTHOG_API_KEY    — Personal API Key (scope: Query Read). 앱의 phc_ 수집 키가 아니다.
//   POSTHOG_PROJECT_ID — 프로젝트 숫자 ID (Settings → Project)
//   POSTHOG_HOST       — 기본 https://eu.posthog.com. 이 프로젝트는 EU 클라우드다
//                        (.env 의 EXPO_PUBLIC_POSTHOG_HOST=eu.i.posthog.com — 수집은
//                        *.i.posthog.com, private API 는 eu.posthog.com 으로 나뉜다)

const HOST = process.env.POSTHOG_HOST ?? 'https://eu.posthog.com';
const KEY = process.env.POSTHOG_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;

if (!KEY || !PROJECT) {
  console.error('POSTHOG_API_KEY, POSTHOG_PROJECT_ID 가 필요합니다');
  process.exit(1);
}

async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${await res.text()}`);
  return (await res.json()).results ?? [];
}

// 창은 실행 시각 기준 rolling — 이번 주 [now-7d, now), 전주 [now-14d, now-7d).
// 월요일 아침에 돌면 사실상 "지난주 vs 그 전주"가 된다.
const CUR = `timestamp >= now() - INTERVAL 7 DAY`;
const PREV = `timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY`;

// 표 순서 = 퍼널 순서 — 발견 → 조회 → 주행 → 참여
const EVENTS = [
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
  ['bike_setup_saved', '내 바이크 저장'],
  ['bike_ride_history_opened', '라이딩 기록 조회'],
  ['chat_message_sent', 'AI 챗 메시지'],
  ['app_opened_from_link', '링크 유입'],
];

function delta(cur, prev) {
  if (prev === 0) return cur > 0 ? 'new' : '—';
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// KST 날짜 라벨 (offset 일 전)
function kstDay(offset) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 - offset * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const [wau, counts, liveNav, endReasons, searchSessions] = await Promise.all([
  // WAU — 어떤 이벤트든 남긴 고유 사용자 (화면 조회 포함)
  hogql(`
    SELECT
      count(DISTINCT if(${CUR}, person_id, NULL)) AS cur,
      count(DISTINCT if(${PREV}, person_id, NULL)) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
  `),
  hogql(`
    SELECT event, countIf(${CUR}) AS cur, countIf(${PREV}) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event IN (${EVENTS.map(([e]) => `'${e}'`).join(', ')})
    GROUP BY event
  `),
  // 계측 v2 실주행 세션만 — preview와 섞지 않고 시작·종료를 id로 연결한다.
  hogql(`
    SELECT
      count(DISTINCT if(${CUR}, properties.guide_session_id, NULL)) AS cur,
      count(DISTINCT if(${PREV}, properties.guide_session_id, NULL)) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event = 'navigation_started' AND properties.mode = 'live'
      AND properties.guide_session_id IS NOT NULL
  `),
  hogql(`
    SELECT properties.reason AS reason, count() AS n
    FROM events
    WHERE ${CUR} AND event = 'navigation_ended'
      AND properties.mode = 'live'
      AND properties.guide_session_id IS NOT NULL
    GROUP BY reason
  `),
  // 검색 결과를 본 세션 중 하나라도 고른 세션 — 화면·결과 종류가 달라도 id로 묶는다.
  hogql(`
    SELECT
      count(DISTINCT if(${CUR} AND event = 'search_results_viewed', properties.search_id, NULL)) AS viewed_cur,
      count(DISTINCT if(${CUR} AND event = 'search_result_selected', properties.search_id, NULL)) AS selected_cur,
      count(DISTINCT if(${PREV} AND event = 'search_results_viewed', properties.search_id, NULL)) AS viewed_prev,
      count(DISTINCT if(${PREV} AND event = 'search_result_selected', properties.search_id, NULL)) AS selected_prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event IN ('search_results_viewed', 'search_result_selected')
      AND properties.search_id IS NOT NULL
  `),
]);

const byEvent = new Map(counts.map(([e, cur, prev]) => [e, { cur, prev }]));
const [wauCur = 0, wauPrev = 0] = wau[0] ?? [];
const [liveCur = 0, livePrev = 0] = liveNav[0] ?? [];
const arrived = endReasons.find(([r]) => r === 'arrived')?.[1] ?? 0;
const cancelled = endReasons.find(([r]) => r === 'cancelled')?.[1] ?? 0;
// abandoned = 안내 마커가 다음 앱 실행까지 남은 것. 강제 종료·OS 종료·크래시를
// 구분할 수 없으므로 크래시율로 해석하지 않는다.
const abandoned = endReasons.find(([r]) => r === 'abandoned')?.[1] ?? 0;
const [searchViewedCur = 0, searchSelectedCur = 0, searchViewedPrev = 0, searchSelectedPrev = 0] =
  searchSessions[0] ?? [];

const lines = [];
lines.push(`# 주간 다이제스트 (${kstDay(7)} ~ ${kstDay(0)})`);
lines.push('');
lines.push(`**활성 사용자(WAU)**: ${wauCur} (전주 ${wauPrev}, ${delta(wauCur, wauPrev)})`);
lines.push(`**실주행(live 길안내)**: ${liveCur} (전주 ${livePrev}, ${delta(liveCur, livePrev)})`);
if (liveCur > 0) {
  lines.push(
    `**실주행 도착률(v2)**: ${Math.round((arrived / liveCur) * 100)}% (시작 ${liveCur} · 도착 ${arrived} · 중도 종료 ${cancelled} · 비정상 종료 ${abandoned})`,
  );
}
if (searchViewedCur > 0) {
  const curRate = Math.round((searchSelectedCur / searchViewedCur) * 100);
  const prevRate = searchViewedPrev > 0
    ? `${Math.round((searchSelectedPrev / searchViewedPrev) * 100)}%`
    : '—';
  lines.push(
    `**검색 결과 선택률(v2)**: ${curRate}% (결과 노출 ${searchViewedCur} · 선택 ${searchSelectedCur}, 전주 ${prevRate})`,
  );
}
lines.push('');
lines.push('| 이벤트 | 이번 주 | 전주 | 증감 |');
lines.push('|---|---:|---:|---:|');
for (const [event, label] of EVENTS) {
  const { cur = 0, prev = 0 } = byEvent.get(event) ?? {};
  lines.push(`| ${label} | ${cur} | ${prev} | ${delta(cur, prev)} |`);
}
lines.push('');
lines.push(`_기준: 실행 시각으로부터 최근 7일 vs 그 전 7일 (rolling) · ${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')} KST 생성_`);

console.log(lines.join('\n'));

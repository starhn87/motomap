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
  ['search_result_selected', '검색 결과 선택'],
  ['category_filtered', '카테고리 필터'],
  ['place_viewed', '장소 상세 조회'],
  ['navigation_previewed', '경로 미리보기'],
  ['navigation_started', '길안내 시작'],
  ['navigation_ended', '길안내 종료'],
  ['route_failed', '경로 탐색 실패'],
  ['favorite_toggled', '즐겨찾기 토글'],
  ['review_submitted', '리뷰 작성'],
  ['place_submitted', '장소 제보'],
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

const [wau, counts, liveNav, endReasons, misses] = await Promise.all([
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
  // 실주행만 따로 — preview(모의 주행)와 섞으면 진짜 사용을 못 읽는다
  hogql(`
    SELECT countIf(${CUR}) AS cur, countIf(${PREV}) AS prev
    FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event = 'navigation_started' AND properties.mode = 'live'
  `),
  hogql(`
    SELECT properties.reason AS reason, count() AS n
    FROM events
    WHERE ${CUR} AND event = 'navigation_ended'
    GROUP BY reason
  `),
  // 실재하는데(카카오에 있음) 우리 DB 에 없던 검색어 — 시드·제보 우선순위
  hogql(`
    SELECT properties.query AS q, count() AS n
    FROM events
    WHERE ${CUR} AND event = 'search_no_results'
      AND toFloat(properties.kakao_count) > 0 AND properties.query IS NOT NULL
    GROUP BY q ORDER BY n DESC LIMIT 5
  `),
]);

const byEvent = new Map(counts.map(([e, cur, prev]) => [e, { cur, prev }]));
const [wauCur = 0, wauPrev = 0] = wau[0] ?? [];
const [liveCur = 0, livePrev = 0] = liveNav[0] ?? [];
const arrived = endReasons.find(([r]) => r === 'arrived')?.[1] ?? 0;
const cancelled = endReasons.find(([r]) => r === 'cancelled')?.[1] ?? 0;
// abandoned = 안내 중 앱 강제 종료·크래시를 다음 실행 때 정산한 것 (runtime 1.2.4 OTA 이후)
const abandoned = endReasons.find(([r]) => r === 'abandoned')?.[1] ?? 0;

const lines = [];
lines.push(`# 주간 다이제스트 (${kstDay(7)} ~ ${kstDay(0)})`);
lines.push('');
lines.push(`**활성 사용자(WAU)**: ${wauCur} (전주 ${wauPrev}, ${delta(wauCur, wauPrev)})`);
lines.push(`**실주행(live 길안내)**: ${liveCur} (전주 ${livePrev}, ${delta(liveCur, livePrev)})`);
const endedTotal = arrived + cancelled + abandoned;
if (endedTotal > 0) {
  lines.push(
    `**길안내 완주율**: ${Math.round((arrived / endedTotal) * 100)}% (도착 ${arrived} · 중도 종료 ${cancelled} · 비정상 종료 ${abandoned})`,
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
lines.push('## 우리 DB에 없던 검색어 top 5');
if (misses.length === 0) {
  lines.push('이번 주 없음');
} else {
  lines.push('| 검색어 | 횟수 |');
  lines.push('|---|---:|');
  for (const [q, n] of misses) lines.push(`| ${q} | ${n} |`);
  lines.push('');
  lines.push('_카카오에는 있는데 등록 장소에 없던 검색 — 시드·제보 우선순위_');
}
lines.push('');
lines.push(`_기준: 실행 시각으로부터 최근 7일 vs 그 전 7일 (rolling) · ${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')} KST 생성_`);

console.log(lines.join('\n'));

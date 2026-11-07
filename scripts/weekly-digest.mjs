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

import {
  DIGEST_EVENTS as EVENTS,
  delta,
  kstDay,
  wauQuery,
  eventCountsQuery,
  liveNavigationQuery,
  endReasonsQuery,
  endExitsQuery,
  searchSessionsQuery,
  submissionAttemptsQuery,
} from './posthog-metrics.mjs';

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

// 창·쿼리 본문은 scripts/posthog-metrics.mjs 가 단일 기준이다.
const [wau, counts, liveNav, endReasons, endExits, searchSessions] = await Promise.all([
  hogql(wauQuery()),
  hogql(eventCountsQuery()),
  hogql(liveNavigationQuery()),
  hogql(endReasonsQuery()),
  hogql(endExitsQuery()),
  hogql(searchSessionsQuery()),
]);

const byEvent = new Map(counts.map(([e, cur, prev]) => [e, { cur, prev }]));
const [wauCur = 0, wauPrev = 0] = wau[0] ?? [];
const [liveCur = 0, livePrev = 0] = liveNav[0] ?? [];
const arrived = endReasons.find(([r]) => r === 'arrived')?.[1] ?? 0;
const cancelled = endReasons.find(([r]) => r === 'cancelled')?.[1] ?? 0;
// abandoned = 안내 마커가 다음 앱 실행까지 남은 것. 강제 종료·OS 종료·크래시를
// 구분할 수 없으므로 크래시율로 해석하지 않는다.
const abandoned = endReasons.find(([r]) => r === 'abandoned')?.[1] ?? 0;
const arrivedFlag = (value) => value === true || value === 'true' || value === 1;
const exitLabel = (exit, hadArrived) => {
  const viaArrival = arrivedFlag(hadArrived);
  if (exit === 'user_end') return viaArrival ? '직접 종료·도착 콜백' : '직접 종료';
  if (exit === 'process_end') return viaArrival ? '프로세스 종료·도착 콜백' : '프로세스 종료';
  if (exit === 'no_goal') return '목적지 없음';
  if (exit === 'start_failed') return '시작 실패';
  return String(exit);
};
const [searchViewedCur = 0, searchSelectedCur = 0, searchViewedPrev = 0, searchSelectedPrev = 0] =
  searchSessions[0] ?? [];
// 제보 시도의 result 분포. 열기−시도 = 버튼을 누르기 전에 나간 경우.
const submissionAttempts = await hogql(submissionAttemptsQuery());
const submissionResultLabel = {
  login: '로그인 벽',
  missing_name: '장소명 없음',
  missing_category: '카테고리 없음',
  missing_address: '주소 없음',
  duplicate_approved: '이미 등록',
  duplicate_pending: '검토 중 중복',
  error: '전송 실패',
  submitted: '접수',
};

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
if (endExits.length > 0) {
  lines.push(
    `**실주행 종료 계기**: ${endExits.map(([exit, hadArrived, n]) => `${exitLabel(exit, hadArrived)} ${n}`).join(' · ')}`,
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
if (submissionAttempts.length > 0) {
  lines.push(
    `**장소 제보 시도**: ${submissionAttempts.map(([result, n]) => `${submissionResultLabel[result] ?? result} ${n}`).join(' · ')}`,
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

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyLiveEndSession,
  endReasonsQuery,
  formatLiveArrivalLines,
  liveEndSessionQuery,
  summarizeLiveEndSessions,
} from '../scripts/posthog-metrics.mjs';

const session = (
  id: string,
  arrived = 0,
  cancelled = 0,
  abandoned = 0,
  processEnd = 0,
  hadArrived = 0,
) => [id, arrived, cancelled, abandoned, processEnd, hadArrived];

test('reason=arrived 세션은 도착이다', () => {
  assert.equal(classifyLiveEndSession(session('a', 1, 0, 0, 0, 0)), 'arrived');
});

test('had_arrived 인 중도 종료·비정상 종료·process_end 는 도착으로 옮긴다', () => {
  assert.equal(classifyLiveEndSession(session('c', 0, 1, 0, 0, 1)), 'arrived');
  assert.equal(classifyLiveEndSession(session('b', 0, 0, 1, 1, 1)), 'arrived');
  assert.equal(classifyLiveEndSession(session('p', 0, 0, 0, 1, 1)), 'arrived');
});

test('had_arrived 가 아닌 중도 종료와 비정상 종료는 기존 버킷에 남는다', () => {
  assert.equal(classifyLiveEndSession(session('c', 0, 1, 0, 0, 0)), 'cancelled');
  assert.equal(classifyLiveEndSession(session('b', 0, 0, 1, 1, 0)), 'abandoned');
  assert.equal(classifyLiveEndSession(session('p', 0, 0, 0, 1, 0)), 'abandoned');
});

test('같은 guide_session_id 는 한 세션이고 도착이면 다른 버킷에서 빠진다', () => {
  const counts = summarizeLiveEndSessions([
    session('same', 1, 0, 0, 0, 0),
    session('same', 0, 1, 0, 0, 0),
    session('cancel', 0, 2, 0, 0, 0),
    session('dead', 0, 0, 1, 1, 1),
  ]);
  assert.deepEqual(counts, { arrived: 2, cancelled: 1, abandoned: 0, other: 0 });
});

test('출력은 정의 변경 라벨과 기존 reason=arrived 값을 같이 찍는다', () => {
  const lines = formatLiveArrivalLines(
    10,
    { arrived: 4, cancelled: 3, abandoned: 1 },
    { arrived: 2, cancelled: 5, abandoned: 3 },
  );
  assert.equal(lines.length, 2);
  assert.match(lines[0], /정의 변경: 도착 또는 had_arrived, 세션/);
  assert.match(lines[0], /40%/);
  assert.match(lines[0], /도착 4 · 중도 종료 3 · 비정상 종료 1/);
  assert.match(lines[1], /기존 정의: reason=arrived 이벤트/);
  assert.match(lines[1], /20%/);
  assert.match(lines[1], /도착 2 · 중도 종료 5 · 비정상 종료 3/);
  assert.deepEqual(formatLiveArrivalLines(0, { arrived: 1, cancelled: 0, abandoned: 0 }, { arrived: 1, cancelled: 0, abandoned: 0 }), []);
});

test('세션 쿼리는 guide_session_id 로 묶고, 관리자용 reason 쿼리는 had_arrived 를 쓰지 않는다', () => {
  const sessions = liveEndSessionQuery();
  assert.match(sessions, /GROUP BY properties\.guide_session_id/);
  assert.match(sessions, /properties\.had_arrived = true/);
  assert.match(sessions, /properties\.exit = 'process_end'/);
  assert.match(sessions, /properties\.mode = 'live'/);
  assert.doesNotMatch(endReasonsQuery(), /had_arrived/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import type { RideSession } from '@/lib/api/rideSessions';
import {
  activeRidePlaybackEntry,
  buildRidePlaybackTimeline,
  ridePlaybackPoint,
  ridePlaybackProgress,
} from '@/lib/ridePlayback';
import {
  parseRidePathSegments,
  simplifyRideSegment,
  type RidePathSegments,
} from '@/lib/ridePath';

function session(
  id: string,
  startedAt: string,
  pathSegments: RidePathSegments,
): RideSession {
  return {
    id,
    bikeId: null,
    bikeModel: null,
    bikeNickname: null,
    goalPlaceId: null,
    goalGeneralPlaceId: null,
    goalName: '테스트 목적지',
    goalLatitude: pathSegments[0][pathSegments[0].length - 1][1],
    goalLongitude: pathSegments[0][pathSegments[0].length - 1][0],
    startedAt,
    endedAt: startedAt,
    endedReason: 'arrived',
    isPartial: false,
    distanceM: 0,
    durationS: 0,
    movingDurationS: 0,
    pointCount: pathSegments.flat().length,
    segmentCount: pathSegments.length,
    pathSegments,
  };
}

test('Visualizer는 세션 날짜를 정렬하고 끊긴 선분 사이에 빈 시간을 둔다', () => {
  const later = session('later', '2026-08-02T00:00:00.000Z', [[
    [127.02, 37.52, 0],
    [127.03, 37.53, 1_000],
  ]]);
  const earlier = session('earlier', '2026-08-01T00:00:00.000Z', [
    [
      [127, 37.5, 0],
      [127.01, 37.51, 1_000],
    ],
    [
      [127.015, 37.515, 2_000],
      [127.016, 37.516, 3_000],
    ],
  ]);

  const timeline = buildRidePlaybackTimeline([later, earlier], 4_000);
  assert.deepEqual(
    timeline.entries.map((entry) => entry.sessionId),
    ['earlier', 'earlier', 'later'],
  );
  assert.ok(timeline.entries[1].startsAtMs > timeline.entries[0].endsAtMs);
  assert.ok(timeline.entries[2].startsAtMs > timeline.entries[1].endsAtMs);

  const gapMs = (timeline.entries[0].endsAtMs + timeline.entries[1].startsAtMs) / 2;
  assert.equal(activeRidePlaybackEntry(timeline, gapMs), null);
});

test('재생 마커는 점 개수가 아니라 실제 경로 거리를 따라 보간한다', () => {
  const ride = session('ride', '2026-08-01T00:00:00.000Z', [[
    [127, 37.5, 0],
    [127.001, 37.5, 1_000],
    [127.011, 37.5, 2_000],
  ]]);
  const timeline = buildRidePlaybackTimeline([ride], 2_000);
  const entry = timeline.entries[0];
  const point = ridePlaybackPoint(entry, 0.5);

  assert.ok(point);
  assert.ok(point.longitude > 127.004 && point.longitude < 127.007);
  assert.equal(ridePlaybackProgress(entry, entry.startsAtMs), 0);
  assert.equal(ridePlaybackProgress(entry, entry.endsAtMs), 1);
});

test('경로 JSON은 시간 역행을 거부하고 단순화해도 양 끝점을 보존한다', () => {
  assert.equal(parseRidePathSegments([[
    [127, 37.5, 1_000],
    [127.01, 37.51, 500],
  ]]), null);

  const original: RidePathSegments[0] = [
    [127, 37.5, 0],
    [127.00001, 37.50001, 1_000],
    [127.01, 37.51, 2_000],
  ];
  const simplified = simplifyRideSegment(original, 20);
  assert.deepEqual(simplified[0], original[0]);
  assert.deepEqual(simplified[simplified.length - 1], original[original.length - 1]);
});

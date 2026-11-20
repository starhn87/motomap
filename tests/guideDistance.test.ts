import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRemainingDistance } from '../lib/guideDistance';

test('남은 거리는 도착 전 5m·20m 단위와 1km 경계를 양 플랫폼에서 같이 표시한다', () => {
  for (const [meters, expected] of [
    [0, '0m'], [1, '5m'], [4, '5m'], [9, '5m'], [99, '95m'],
    [100, '100m'], [101, '100m'], [119, '100m'], [120, '120m'],
    [999, '980m'], [1000, '1.0km'], [1500, '1.5km'],
  ] as const) {
    assert.equal(formatRemainingDistance(meters), expected);
  }
});
